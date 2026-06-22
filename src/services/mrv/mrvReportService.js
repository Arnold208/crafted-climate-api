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
const RegistryEvent          = require('../../models/mrv/assurance/RegistryEvent.model');
const VerificationCase       = require('../../models/mrv/assurance/VerificationCase.model');
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
  /**
   * Build the full export package for a monitoring period.
   * Returns a structured manifest with the report, PDF blob URL, evidence files
   * (with SHA-256 hashes), VVB opinion, calculation run, and a submission checklist.
   * This is everything needed to upload to Verra, Gold Standard, or Ghana CMO.
   *
   * @param {string} projectId
   * @param {string} monitoringPeriodId
   * @returns {Object} Export package
   */
  async buildExportPackage(projectId, monitoringPeriodId) {
    const [report, vvbCase] = await Promise.all([
      MRVReport
        .findOne({ monitoringPeriodId, projectId })
        .sort({ reportVersion: -1 })
        .lean(),
      VerificationCase
        .findOne({ projectId, status: 'OPINION_RECORDED', scope: { $in: ['VERIFICATION', 'COMBINED'] } })
        .sort({ openedAt: -1 })
        .lean(),
    ]);

    if (!report) {
      throw new Error(`No report found for monitoring period ${monitoringPeriodId}. Generate one first via GET /report.`);
    }

    const sections    = report.sections || {};
    const calc        = sections.calculationResults || {};
    const attachments = sections.attachmentsManifest || [];

    const vvbOpinion = vvbCase?.verificationOpinion?.opinion;
    const isPositiveOpinion = vvbOpinion === 'POSITIVE' || vvbOpinion === 'POSITIVE_WITH_QUALIFICATIONS';

    return {
      packageVersion: '1.0',
      generatedAt:    new Date().toISOString(),
      report: {
        reportId:      report.reportId,
        reportVersion: report.reportVersion,
        status:        report.status,
        sha256:        report.sha256,
        generatedAt:   report.generatedAt,
        blobUrl:       report.blobUrl || null,
      },
      calculationRun: {
        runId:               calc.calculationRunId || null,
        netReduction_tco2e:  calc.netEmissionReduction_er_tco2e || null,
        methodologyVersion:  calc.methodology || 'VM0050',
        inputDatasetHash:    calc.inputDatasetHash || null,
        approvedBy:          calc.approvedBy || null,
        approvedAt:          calc.approvedAt || null,
      },
      evidence: attachments.map(a => ({
        evidenceId: a.evidenceId,
        title:      a.title,
        filename:   a.filename,
        sha256:     a.sha256,
        blobPath:   a.blobPath,
        status:     a.status,
      })),
      vvbOpinion: vvbCase ? {
        caseId:     vvbCase.caseId,
        vvbName:    vvbCase.vvbOrganizationName,
        opinion:    vvbOpinion,
        notes:      vvbCase.verificationOpinion?.notes,
        recordedAt: vvbCase.verificationOpinion?.recordedAt,
      } : null,
      submissionChecklist: {
        reportFinal:         report.status === 'FINAL' || report.status === 'SUBMITTED',
        vvbOpinionPositive:  isPositiveOpinion,
        calculationApproved: !!calc.approvedBy,
        evidenceUploaded:    attachments.length > 0,
        alreadySubmitted:    report.status === 'SUBMITTED',
        pendingCountersign:  report.submissionRequest?.status === 'PENDING_COUNTERSIGN',
      },
    };
  }

  /**
   * Step 1 of 2 — Initiate a submission request (Admin A).
   *
   * Validates the report and VVB opinion, then creates a PENDING_COUNTERSIGN
   * request on the report. A second mrv-programme-admin (Admin B, different
   * person) must call countersignSubmission() within 48 hours to complete.
   *
   * Per VCS Standard §4.1.4 and ISO 14064-3, monitoring report submissions
   * require segregation of duties between preparer and authorising signatory.
   *
   * @param {string} projectId
   * @param {string} monitoringPeriodId
   * @param {{ registry: string, notes?: string, requestedBy: string }} opts
   */
  async initiateSubmission(projectId, monitoringPeriodId, { registry, notes, requestedBy }) {
    const report = await MRVReport
      .findOne({ monitoringPeriodId, projectId })
      .sort({ reportVersion: -1 });

    if (!report) throw new Error('No report found for this monitoring period');
    if (report.status === 'SUBMITTED') throw new Error('This report has already been submitted');
    if (report.status !== 'FINAL') {
      throw new Error(`Report must be FINAL before submission (current: ${report.status})`);
    }
    if (report.submissionRequest?.status === 'PENDING_COUNTERSIGN') {
      const exp = new Date(report.submissionRequest.expiresAt);
      throw new Error(
        `A countersign request is already pending (expires ${exp.toISOString()}). ` +
        `Ask a second mrv-programme-admin to call POST /report/submit/countersign.`
      );
    }

    // VCS §4.1.4 / Gold Standard: POSITIVE VVB opinion required before submission
    if (['VERRA_VCS', 'GOLD_STANDARD'].includes(registry)) {
      const vvbCase = await VerificationCase
        .findOne({ projectId, status: 'OPINION_RECORDED', scope: { $in: ['VERIFICATION', 'COMBINED'] } })
        .sort({ openedAt: -1 })
        .lean();
      const opinion    = vvbCase?.verificationOpinion?.opinion;
      const isPositive = opinion === 'POSITIVE' || opinion === 'POSITIVE_WITH_QUALIFICATIONS';
      if (!isPositive) {
        throw new Error(
          `A POSITIVE VVB verification opinion is required before submitting to ${registry}. ` +
          `Current opinion: ${opinion || 'none recorded'}. ` +
          `Record one via POST /verification-cases/:id/opinion.`
        );
      }
    }

    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
    report.submissionRequest = {
      requestedBy,
      requestedAt: new Date(),
      expiresAt,
      registry,
      notes: notes || '',
      status: 'PENDING_COUNTERSIGN',
    };
    await report.save();

    await createAuditLog({
      action:  'MRV_SUBMISSION_INITIATED',
      userid:  requestedBy,
      details: { reportId: report.reportId, monitoringPeriodId, projectId, registry, expiresAt },
    });

    return {
      reportId:     report.reportId,
      status:       'PENDING_COUNTERSIGN',
      requestedBy,
      requestedAt:  report.submissionRequest.requestedAt,
      expiresAt,
      registry,
      message:      'Submission initiated. A second mrv-programme-admin must countersign within 48 hours via POST /report/submit/countersign.',
    };
  }

  /**
   * Step 2 of 2 — Countersign and complete the submission (Admin B).
   *
   * Admin B must be a different user from Admin A (enforced server-side).
   * Transitions MRVReport → SUBMITTED, advances MRVProject status,
   * updates Ghana CMO pathway if applicable, auto-logs a RegistryEvent,
   * and fires the mrv.report.submitted webhook.
   *
   * @param {string} projectId
   * @param {string} monitoringPeriodId
   * @param {{ countersignedBy: string }} opts
   */
  async countersignSubmission(projectId, monitoringPeriodId, { countersignedBy }) {
    const report = await MRVReport
      .findOne({ monitoringPeriodId, projectId })
      .sort({ reportVersion: -1 });

    if (!report) throw new Error('No report found for this monitoring period');
    if (report.status === 'SUBMITTED') throw new Error('This report has already been submitted');

    const req = report.submissionRequest;
    if (!req || req.status !== 'PENDING_COUNTERSIGN') {
      throw new Error('No pending countersign request found. Admin A must initiate submission first via POST /report/submit.');
    }
    if (new Date() > new Date(req.expiresAt)) {
      report.submissionRequest.status = 'EXPIRED';
      await report.save();
      throw new Error('The countersign request has expired (48-hour window passed). Admin A must re-initiate submission.');
    }
    if (req.requestedBy === countersignedBy) {
      throw new Error(
        'The countersigning admin must be a different person from the one who initiated the submission. ' +
        'This enforces segregation of duties per VCS Standard §4.1.4.'
      );
    }

    const registry = req.registry;

    // Transition report → SUBMITTED
    report.status              = 'SUBMITTED';
    report.submittedAt         = new Date();
    report.submittedBy         = countersignedBy;
    report.submittedTo         = registry;
    report.submissionNotes     = req.notes || '';
    report.submissionRequest.status = 'CONFIRMED';
    await report.save();

    // Advance project status + handle Ghana CMO pathway
    const projectUpdate = {};
    if (registry === 'VERRA_VCS' || registry === 'GOLD_STANDARD') {
      projectUpdate.status = 'VERRA_REVIEW';
    }
    if (registry === 'GHANA_CMO') {
      // Article 6 compliance: track CMO engagement status on the Ghana pathway
      projectUpdate['ghanaPathway.cmoEngagementStatus'] = 'SUBMITTED';
    }

    const project = await MRVProject.findOneAndUpdate(
      { projectId },
      { $set: projectUpdate },
      { new: true }
    ).lean();

    // Auto-log RegistryEvent (immutable audit record)
    await RegistryEvent.create({
      eventId:        `EVT-${uuidv4()}`,
      projectId,
      organizationId: project?.organizationId,
      registry,
      eventType:      'MONITORING_REPORT_SUBMITTED',
      eventDate:      new Date(),
      description:    `Monitoring report ${report.reportId} submitted via Crafted Climate MRV platform. Initiated by ${req.requestedBy}, countersigned by ${countersignedBy}.`,
      externalRef:    report.reportId,
      recordedBy:     countersignedBy,
      notes:          req.notes || '',
    });

    // Audit log
    await createAuditLog({
      action:  'MRV_REPORT_SUBMITTED',
      userid:  countersignedBy,
      details: {
        reportId: report.reportId, monitoringPeriodId, projectId, registry,
        sha256: report.sha256, initiatedBy: req.requestedBy
      },
    });

    // Fire webhook (non-blocking, non-fatal)
    const webhookService = require('../webhook.service');
    webhookService.dispatch(project?.organizationId, 'mrv.report.submitted', {
      event:              'mrv.report.submitted',
      reportId:           report.reportId,
      projectId,
      registry,
      submittedAt:        report.submittedAt,
      initiatedBy:        req.requestedBy,
      countersignedBy,
    }).catch(e => console.error('[MRVReport] Webhook dispatch failed (non-fatal):', e.message));

    // Build and return the final export package
    const exportPackage = await this.buildExportPackage(projectId, monitoringPeriodId);
    return {
      reportId:        report.reportId,
      status:          'SUBMITTED',
      submittedAt:     report.submittedAt,
      submittedTo:     registry,
      initiatedBy:     req.requestedBy,
      countersignedBy,
      exportPackage,
    };
  }
}

module.exports = new MRVReportService();
