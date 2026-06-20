'use strict';
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const MRVReport              = require('../../models/mrv/outbound/MRVReport.model');
const MRVProject             = require('../../models/mrv/project/MRVProject.model');
const MonitoringPeriod       = require('../../models/mrv/monitoring/MonitoringPeriod.model');
const MRVObservation         = require('../../models/mrv/evidence/MRVObservation.model');
const ExternalEvidenceRecord = require('../../models/mrv/evidence/ExternalEvidenceRecord.model');
const SensorInstallation     = require('../../models/mrv/evidence/SensorInstallation.model');
const CalibrationRecord      = require('../../models/mrv/evidence/CalibrationRecord.model');
const CalculationRun         = require('../../models/mrv/accounting/CalculationRun.model');
const { createAuditLog }     = require('../../utils/auditLogger');

// Statuses that count as "accepted" for calculation purposes
const ACCEPTED_STATUSES = ['ACCEPTED', 'ACCEPTED_WITH_WARNING', 'MANUALLY_APPROVED'];

class MRVReportService {

  /**
   * Build the full structured JSON report for a monitoring period.
   * This is the canonical data source for both the JSON API response and any
   * future PDF generator.
   *
   * @param {string} monitoringPeriodId
   * @param {string} [generatedBy='system']
   * @returns {Object} Structured report data (not yet persisted)
   */
  async buildReportData(monitoringPeriodId, generatedBy = 'system') {
    // ── Load period first (needed for projectId) ───────────────────────────
    const period = await MonitoringPeriod.findOne({ monitoringPeriodId }).lean();
    if (!period) throw new Error(`Monitoring period ${monitoringPeriodId} not found`);

    // ── Load all remaining data in parallel ────────────────────────────────
    const [
      project,
      observations,
      evidence,
      installations,
      calibrations,
      calculationRun,
    ] = await Promise.all([
      MRVProject.findOne({ projectId: period.projectId }).lean(),
      MRVObservation.find({ monitoringPeriodId }).lean(),
      ExternalEvidenceRecord.find({ projectId: period.projectId }).lean(),
      SensorInstallation.find({ projectId: period.projectId }).lean(),
      CalibrationRecord.find({ projectId: period.projectId }).lean(),
      CalculationRun.findOne({ monitoringPeriodId }).sort({ runVersion: -1 }).lean(),
    ]);

    // ── Section 1: Report header ───────────────────────────────────────────
    const header = {
      reportTitle:        `Monitoring Report — ${project?.name || period.projectId}`,
      reportType:         'MONITORING_REPORT',
      standard:           period.standardId || project?.standardId || '',
      methodology:        period.methodologyId || project?.methodologyId || 'VM0050',
      monitoringPeriodId,
      periodName:         period.name || '',
      periodStart:        period.startDate,
      periodEnd:          period.endDate || period.closedAt,
      periodStatus:       period.status,
      projectId:          period.projectId,
      projectName:        project?.name || '',
      organizationId:     project?.organizationId || '',
      generatedAt:        new Date().toISOString(),
      generatedBy,
      reportVersion:      1,
    };

    // ── Section 2: Device inventory ────────────────────────────────────────
    const deviceInventory = installations.map(inst => {
      // Find the most recent calibration for this device
      const lastCalibration = calibrations
        .filter(c => c.auid === inst.auid)
        .sort((a, b) => new Date(b.calibratedAt || b.validFrom) - new Date(a.calibratedAt || a.validFrom))[0];

      return {
        installationId:  inst.installationId,
        auid:            inst.auid,
        devid:           inst.devid,
        model:           inst.model,
        positionDescription: inst.positionDescription,
        installedAt:     inst.installedAt,
        status:          inst.status,
        lastCalibration: lastCalibration?.calibratedAt || lastCalibration?.validFrom || null,
        nextCalibrationDue: lastCalibration?.nextCalibrationDue || null,
      };
    });

    // ── Section 3: Observation summary ────────────────────────────────────
    const accepted        = observations.filter(o => ACCEPTED_STATUSES.includes(o.qualityStatus));
    const acceptedWarning = observations.filter(o => o.qualityStatus === 'ACCEPTED_WITH_WARNING');
    const manuallyApproved = observations.filter(o => o.qualityStatus === 'MANUALLY_APPROVED');
    const quarantined     = observations.filter(o => o.qualityStatus === 'QUARANTINED');
    const voided          = observations.filter(o => o.qualityStatus === 'VOIDED');
    const pending         = observations.filter(o =>
      !['ACCEPTED', 'ACCEPTED_WITH_WARNING', 'MANUALLY_APPROVED', 'QUARANTINED', 'VOIDED', 'REJECTED', 'SUBSTITUTED', 'SUPERSEDED'].includes(o.qualityStatus)
    );

    const observationSummary = {
      total:               observations.length,
      accepted:            accepted.length,
      acceptedWithWarning: acceptedWarning.length,
      manuallyApproved:    manuallyApproved.length,
      quarantined:         quarantined.length,
      voided:              voided.length,
      pending:             pending.length,
      acceptanceRate:      observations.length > 0
        ? ((accepted.length / observations.length) * 100).toFixed(2) + '%'
        : 'N/A',
      // Full detail on quarantined items — auditors need these
      quarantinedObservations: quarantined.map(o => ({
        observationId: o.observationId,
        auid:          o.auid,
        observedAt:    o.observedAt,
        flagReason:    o.qualityWarnings?.join('; ') || '',
      })),
    };

    // ── Section 4: Data gap analysis ──────────────────────────────────────
    const dataGapAnalysis = this._analyseDataGaps(accepted, period);

    // ── Section 5: Calculation results ────────────────────────────────────
    let calculationResults;
    if (calculationRun) {
      calculationResults = {
        calculationRunId:                 calculationRun.calculationRunId,
        runVersion:                       calculationRun.runVersion,
        status:                           calculationRun.status,
        methodology:                      'VM0050',
        baselineTier:                     'TIER_1_IPCC',
        constants:                        calculationRun.intermediateValues?.constants,
        totalLpgConsumedKg:               calculationRun.results?.total_lpg_consumed_kg,
        baselineEmissions_be_tco2e:       calculationRun.results?.be_tco2e,
        projectEmissions_pe_tco2e:        calculationRun.results?.pe_tco2e,
        leakage_lk_tco2e:                 calculationRun.results?.lk_tco2e,
        netEmissionReduction_er_tco2e:    calculationRun.results?.net_er_tco2e,
        netEmissionReduction_rounded:     calculationRun.results?.net_er_tco2e_rounded,
        observationCount:                 calculationRun.results?.observation_count,
        inputDatasetHash:                 calculationRun.inputDatasetHash,
        calculatedAt:                     calculationRun.calculatedAt,
        calculatedBy:                     calculationRun.calculatedBy,
        approvedBy:                       calculationRun.approvedBy,
        approvedAt:                       calculationRun.approvedAt,
      };
    } else {
      calculationResults = {
        status: 'NOT_CALCULATED',
        note:   'No calculation run found for this monitoring period. Run POST /calculate to generate results.',
      };
    }

    // ── Section 6: Attachments manifest ───────────────────────────────────
    const attachmentsManifest = evidence.map(ev => ({
      evidenceId:  ev.evidenceId,
      type:        ev.evidenceType,
      title:       ev.title,
      filename:    ev.blobPath?.split('/').pop() || '',
      uploadedAt:  ev.uploadedAt,
      uploadedBy:  ev.uploadedBy,
      sha256:      ev.fileHash,
      blobPath:    ev.blobPath,
      status:      ev.status,
    }));

    // ── Section 7: Completeness snapshot ──────────────────────────────────
    const completeness = period.completenessSnapshot || {};

    // ── Section 8: Calibration records ────────────────────────────────────
    const calibrationSection = calibrations.map(c => ({
      calibrationId:       c.calibrationId,
      auid:                c.auid,
      channel:             c.channel,
      calibratedAt:        c.calibratedAt,
      validFrom:           c.validFrom,
      validTo:             c.validTo,
      nextCalibrationDue:  c.nextCalibrationDue,
      status:              c.status,
      accuracyClass:       c.accuracyClass,
      traceabilityStandard: c.traceabilityStandard,
      laboratory:          c.laboratory,
    }));

    return {
      header,
      deviceInventory,
      observationSummary,
      dataGapAnalysis,
      calculationResults,
      attachmentsManifest,
      completeness,
      calibrations: calibrationSection,
    };
  }

  /**
   * Internal: detect data gaps in accepted observations.
   * A gap is any calendar day within the monitoring period that has zero
   * accepted observations (across all devices).
   *
   * @param {Object[]} acceptedObs  Already-filtered accepted observations
   * @param {Object}   period       MonitoringPeriod document
   * @returns {Object}
   */
  _analyseDataGaps(acceptedObs, period) {
    if (!period.startDate) {
      return { gaps: [], gapDays: 0, note: 'Period has no startDate — gap analysis skipped' };
    }
    if (!acceptedObs.length) {
      return { gaps: [], gapDays: 0, note: 'No accepted observations — gap analysis skipped' };
    }

    const start     = new Date(period.startDate);
    const end       = period.endDate ? new Date(period.endDate) : new Date();
    const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

    // Build a set of ISO date strings that have at least one observation
    const daySet = new Set(
      acceptedObs
        .map(o => o.observedAt || o.createdAt)
        .filter(Boolean)
        .map(d => new Date(d).toISOString().slice(0, 10))
    );

    const gaps = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const dateStr = cursor.toISOString().slice(0, 10);
      if (!daySet.has(dateStr)) gaps.push(dateStr);
      cursor.setDate(cursor.getDate() + 1);
    }

    return {
      totalPeriodDays:  totalDays,
      daysWithData:     daySet.size,
      gapDays:          gaps.length,
      coveragePercent:  totalDays > 0
        ? ((daySet.size / totalDays) * 100).toFixed(2) + '%'
        : 'N/A',
      gaps: gaps.slice(0, 100), // cap payload — full list available via raw query
    };
  }

  /**
   * Get or generate a persisted JSON report for a monitoring period.
   *
   * Returns the most-recent FINAL report if one already exists with data.
   * Otherwise builds fresh, persists to MRVReport collection, and returns it.
   *
   * @param {string} monitoringPeriodId
   * @param {string} [generatedBy='api']
   * @returns {Object} MRVReport document (lean)
   */
  async getOrGenerateReport(monitoringPeriodId, generatedBy = 'api') {
    // Return cached FINAL report if it exists and has sections
    const existing = await MRVReport
      .findOne({ monitoringPeriodId, status: 'FINAL' })
      .sort({ reportVersion: -1 })
      .lean();

    if (existing?.sections && Object.keys(existing.sections).length > 0) {
      return existing;
    }

    // Build fresh report
    const data   = await this.buildReportData(monitoringPeriodId, generatedBy);
    const sha256 = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');

    // Determine next version number
    const prevReport = await MRVReport
      .findOne({ monitoringPeriodId })
      .sort({ reportVersion: -1 })
      .lean();
    const reportVersion = prevReport ? prevReport.reportVersion + 1 : 1;

    const report = await MRVReport.create({
      reportId:           `RPT-${uuidv4()}`,
      projectId:          data.header.projectId,
      monitoringPeriodId,
      calculationRunId:   data.calculationResults?.calculationRunId || null,
      reportVersion,
      status:             'FINAL',
      format:             'JSON',
      sha256,
      generatedAt:        new Date(),
      generatedBy,
      sections:           data,
    });

    await createAuditLog({
      action:  'MRV_REPORT_GENERATED',
      userid:  generatedBy,
      details: { reportId: report.reportId, monitoringPeriodId, reportVersion, sha256 },
    });

    return report.toObject ? report.toObject() : report;
  }
}

module.exports = new MRVReportService();
