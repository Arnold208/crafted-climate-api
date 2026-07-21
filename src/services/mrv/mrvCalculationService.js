'use strict';
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const CalculationRun = require('../../models/mrv/accounting/CalculationRun.model');
const MRVObservation = require('../../models/mrv/evidence/MRVObservation.model');
const MonitoringPeriod = require('../../models/mrv/monitoring/MonitoringPeriod.model');
const { createAuditLog } = require('../../utils/auditLogger');
const logger = require('../../utils/logger');

// ── VM0050 constants (Option A — Tier 1 IPCC, Ghana fNRB) ────────────────────
const VM0050 = {
  STOVE_EFFICIENCY_RATIO:     3.67,
  EF_BIOMASS_TCO2E_PER_TONNE: 1.747,
  FNRB:                        0.85,
  DISPLACEMENT_FRACTION:       1.0,
  EF_LPG_KG_CO2E_PER_KG:      2.983,
  LEAKAGE:                     0,
  METHODOLOGY:                 'VM0050',
  VERSION:                     '1.0',
  BASELINE_TIER:               'TIER_1_IPCC',
  CREDITING_YEARS:             7,
  PROJECT_TYPE:                'GROUPED',
  ADDITIONALITY:               'COMMON_PRACTICE_BARRIER',
  AGGREGATION:                 'DAILY',
};

// Pre-computed factor: tCO2e per kg LPG consumed (BEy side)
// BEy_factor = (EF_BIOMASS / 1000) × STOVE_EFFICIENCY_RATIO × FNRB × DISPLACEMENT_FRACTION
const BEY_FACTOR = (VM0050.EF_BIOMASS_TCO2E_PER_TONNE / 1000)
  * VM0050.STOVE_EFFICIENCY_RATIO
  * VM0050.FNRB
  * VM0050.DISPLACEMENT_FRACTION;

// PEy_factor: tCO2e per kg LPG burned
const PEY_FACTOR = VM0050.EF_LPG_KG_CO2E_PER_KG / 1000;

const ACCEPTED_STATUSES = ['ACCEPTED', 'ACCEPTED_WITH_WARNING', 'MANUALLY_APPROVED'];

class MRVCalculationService {

  /**
   * Run VM0050 ERy calculation for a closed monitoring period.
   * 
   * 1. Validates period is CLOSED
   * 2. Pulls all accepted observations
   * 3. Aggregates total lpg_consumed_kg
   * 4. Applies ERy = BEy - PEy - LKy
   * 5. Stores CalculationRun with full audit trail
   * 6. Updates MonitoringPeriod status to CALCULATION_COMPLETE
   *
   * @param {string} monitoringPeriodId
   * @param {string} triggeredBy - userId of operator (or 'system')
   * @returns {CalculationRun} the saved run document
   */
  async runCalculation(monitoringPeriodId, triggeredBy = 'system') {
    const startMs = Date.now();

    // ── 1. Load period ──────────────────────────────────────────────────────
    const period = await MonitoringPeriod.findOne({ monitoringPeriodId });
    if (!period) throw new Error(`Monitoring period ${monitoringPeriodId} not found`);
    if (period.status !== 'CLOSED' && period.status !== 'CALCULATION_COMPLETE') {
      throw new Error(`Period must be CLOSED before running calculation (current: ${period.status})`);
    }

    // ── 2. Check for existing approved run (prevent overwrite) ──────────────
    const existingApproved = await CalculationRun.findOne({
      monitoringPeriodId,
      status: { $in: ['APPROVED_FOR_SUBMISSION', 'VVB_VERIFIED', 'VERRA_APPROVED', 'VCUS_ISSUED'] }
    });
    if (existingApproved) {
      throw new Error(`An approved calculation run already exists for this period (${existingApproved.calculationRunId}). Create a new monitoring period to re-calculate.`);
    }

    // ── 3. Pull accepted observations ───────────────────────────────────────
    const observations = await MRVObservation.find({
      monitoringPeriodId,
      qualityStatus: { $in: ACCEPTED_STATUSES },
      'measurements.lpg_consumed_kg': { $exists: true, $gt: 0 }
    }).lean();

    if (!observations.length) {
      throw new Error(`No accepted observations with lpg_consumed_kg found for period ${monitoringPeriodId}`);
    }

    // ── 4. Aggregate daily totals (Option A: daily aggregation) ─────────────
    const dailyMap = {};
    let totalLpgKg = 0;
    const observationIds = [];

    for (const obs of observations) {
      const lpg = parseFloat(obs.measurements?.lpg_consumed_kg) || 0;
      if (lpg <= 0) continue;

      const day = (obs.observedAt || obs.createdAt).toISOString().slice(0, 10);
      dailyMap[day] = (dailyMap[day] || 0) + lpg;
      totalLpgKg += lpg;
      observationIds.push(obs.observationId || obs._id.toString());
    }

    const dailySummary = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, lpg_kg]) => ({
        date,
        lpg_consumed_kg:  parseFloat(lpg_kg.toFixed(6)),
        be_tco2e:          parseFloat((lpg_kg * BEY_FACTOR).toFixed(8)),
        pe_tco2e:          parseFloat((lpg_kg * PEY_FACTOR).toFixed(8)),
        er_tco2e:          parseFloat((lpg_kg * (BEY_FACTOR - PEY_FACTOR)).toFixed(8)),
      }));

    // ── 5. Period-level totals ───────────────────────────────────────────────
    const total_lpg_kg   = parseFloat(totalLpgKg.toFixed(6));
    const be_tco2e       = parseFloat((totalLpgKg * BEY_FACTOR).toFixed(8));
    const pe_tco2e       = parseFloat((totalLpgKg * PEY_FACTOR).toFixed(8));
    const lk_tco2e       = VM0050.LEAKAGE;
    const net_er_tco2e   = parseFloat((be_tco2e - pe_tco2e - lk_tco2e).toFixed(8));
    const net_er_rounded = parseFloat(net_er_tco2e.toFixed(4)); // 4 d.p. per Verra reporting

    // ── 6. Deterministic hash of input dataset ───────────────────────────────
    const inputHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ monitoringPeriodId, observationIds: observationIds.sort(), dailyMap }))
      .digest('hex');

    // ── 7. Determine run version ─────────────────────────────────────────────
    const prevRuns = await CalculationRun.find({ monitoringPeriodId }).lean();
    prevRuns.sort((a, b) => (b.runVersion || 0) - (a.runVersion || 0));
    const prevRun = prevRuns[0];
    const runVersion = prevRun ? prevRun.runVersion + 1 : 1;

    // ── 8. Persist CalculationRun ────────────────────────────────────────────
    const run = await CalculationRun.create({
      calculationRunId:         `CALC-${uuidv4()}`,
      projectId:                period.projectId,
      monitoringPeriodId,
      assignmentId:             period.methodologyAssignmentId || '',
      organizationId:           period.organizationId || '',
      standardVersionId:        period.standardVersionId || '',
      methodologyVersionId:     period.methodologyVersionId || '',
      implementationId:         period.implementationId || '',
      acceptedObservationIds:   observationIds,
      inputDatasetHash:         inputHash,
      runVersion,
      status:                   'SYSTEM_CALCULATED',
      calculatedAt:             new Date(),
      calculatedBy:             triggeredBy,
      runtimeMs:                Date.now() - startMs,
      results: {
        total_lpg_consumed_kg: total_lpg_kg,
        be_tco2e,
        pe_tco2e,
        lk_tco2e,
        net_er_tco2e,
        net_er_tco2e_rounded: net_er_rounded,
        observation_count:     observations.length,
        observation_days:      dailySummary.length,
      },
      intermediateValues: {
        bey_factor:    BEY_FACTOR,
        pey_factor:    PEY_FACTOR,
        daily_summary: dailySummary,
        constants:     VM0050,
      },
    });

    // ── 9. Update MonitoringPeriod ────────────────────────────────────────────
    await MonitoringPeriod.updateOne(
      { monitoringPeriodId },
      {
        $set: {
          status:       'CALCULATION_COMPLETE',
          latestCalculationRunId: run.calculationRunId,
          'completenessSnapshot.netReduction_tco2e': net_er_rounded,
        }
      }
    );

    // ── 10. Audit log ─────────────────────────────────────────────────────────
    await createAuditLog({
      action:  'MRV_CALCULATION_RUN',
      userid:  triggeredBy,
      details: {
        calculationRunId:    run.calculationRunId,
        monitoringPeriodId,
        projectId:           period.projectId,
        methodology:         VM0050.METHODOLOGY,
        net_er_tco2e:        net_er_rounded,
        observation_count:   observations.length,
        runVersion,
      }
    });

    logger.info(`[VM0050] Calculation complete: ${run.calculationRunId} | ERy = ${net_er_rounded} tCO2e`);
    return run;
  }

  /**
   * Get the latest calculation run for a monitoring period.
   */
  async getLatestRun(monitoringPeriodId) {
    const runs = await CalculationRun.find({ monitoringPeriodId }).lean();
    runs.sort((a, b) => (b.runVersion || 0) - (a.runVersion || 0));
    return runs[0] || null;
  }

  /**
   * Get all runs for a monitoring period (full history).
   */
  async getAllRuns(monitoringPeriodId) {
    const runs = await CalculationRun.find({ monitoringPeriodId }).lean();
    runs.sort((a, b) => (b.runVersion || 0) - (a.runVersion || 0));
    return runs;
  }

  /**
   * Approve a calculation run for registry submission.
   */
  async approveRun(calculationRunId, approvedBy, notes = '') {
    const run = await CalculationRun.findOne({ calculationRunId });
    if (!run) throw new Error(`Calculation run ${calculationRunId} not found`);
    if (run.status !== 'SYSTEM_CALCULATED' && run.status !== 'INTERNAL_REVIEW') {
      throw new Error(`Run can only be approved from SYSTEM_CALCULATED or INTERNAL_REVIEW (current: ${run.status})`);
    }
    run.status     = 'APPROVED_FOR_SUBMISSION';
    run.approvedAt = new Date();
    run.approvedBy = approvedBy;
    run.reviewNotes = notes;
    await run.save();

    await createAuditLog({
      action:  'MRV_CALCULATION_APPROVED',
      userid:  approvedBy,
      details: { calculationRunId, notes }
    });
    return run;
  }
}

module.exports = new MRVCalculationService();
