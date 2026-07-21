'use strict';
const MRVObservation = require('../../models/mrv/evidence/MRVObservation.model');
const MonitoringPeriod = require('../../models/mrv/monitoring/MonitoringPeriod.model');
const MRVProject = require('../../models/mrv/project/MRVProject.model');
const MRVSite = require('../../models/mrv/project/MRVSite.model');
const SensorInstallation = require('../../models/mrv/evidence/SensorInstallation.model');
const ExternalEvidenceRecord = require('../../models/mrv/evidence/ExternalEvidenceRecord.model');
const CalculationRun = require('../../models/mrv/accounting/CalculationRun.model');
const CacheService = require('../../modules/common/cache.service');

const ACCEPTED_STATUSES = ['ACCEPTED', 'ACCEPTED_WITH_WARNING', 'MANUALLY_APPROVED'];
const ACTIVE_PROJECT_STATUSES = ['MONITORING', 'CALCULATION', 'VVB_VERIFICATION', 'VERRA_REVIEW'];
const NON_ACTIVE_PROJECT_STATUSES = ['SANDBOX', 'CANDIDATE', 'APPLICABILITY_REVIEW', 'LEGAL_REVIEW', 'PROJECT_CLOSED', 'WITHDRAWN', 'SUSPENDED'];

function countFromAggregation(rows, key = '_id') {
  return rows.reduce((acc, row) => {
    acc[row[key] || 'UNKNOWN'] = row.count || 0;
    return acc;
  }, {});
}

function percent(part, total) {
  if (!total) return 0;
  return Number(((part / total) * 100).toFixed(1));
}

function projectActionState(project, counts) {
  if (project.readinessStatus === 'NOT_READY') return 'BLOCKED';
  if (project.applicabilityStatus === 'NOT_APPLICABLE' || project.applicabilityStatus === 'REQUIRES_REVIEW') return 'BLOCKED';
  if (project.readinessStatus === 'READY' && !ACTIVE_PROJECT_STATUSES.includes(project.status)) return 'READY_TO_START';
  if (project.status === 'READY_FOR_MONITORING') return 'READY_TO_START';
  if ((counts.quarantinedObservations || 0) > 0 || (counts.pendingObservations || 0) > 0) return 'REVIEW_REQUIRED';
  if ((counts.openMonitoringPeriods || 0) > 0) return 'MONITORING';
  if (project.status === 'CALCULATION') return 'CALCULATION_REVIEW';
  if (project.status === 'VVB_VERIFICATION') return 'VERIFIER_REVIEW';
  if (project.status === 'VERRA_REVIEW') return 'VERRA_REVIEW';
  return 'OPEN_WORKSPACE';
}

function projectNextAction(project, counts) {
  const actionState = projectActionState(project, counts);
  if (actionState === 'BLOCKED') return 'Resolve readiness requirements';
  if (actionState === 'READY_TO_START') return 'Open monitoring period';
  if (actionState === 'REVIEW_REQUIRED') return 'Review data quality items';
  if (actionState === 'MONITORING') return 'Monitor active period';
  if (actionState === 'CALCULATION_REVIEW') return 'Review calculation run';
  if (actionState === 'VERIFIER_REVIEW') return 'Support verifier review';
  if (actionState === 'VERRA_REVIEW') return 'Track Verra review';
  return 'Open project workspace';
}

class MRVAnalyticsService {

  /**
   * Project summary — fast, Redis-cached (5 min TTL).
   * Returns total periods, observations, acceptance rate, total tCO2e, active sensors,
   * current period completeness.
   */
  async getProjectSummary(projectId) {
    return CacheService.getOrSet(
      `mrv:analytics:summary:${projectId}`,
      async () => {
        const [project, periods, obsStats, installations] = await Promise.all([
          MRVProject.findOne({ projectId }).lean(),
          MonitoringPeriod.find({ projectId }).lean(),
          MRVObservation.aggregate([
            { $match: { projectId } },
            { $group: {
                _id: null,
                total: { $sum: 1 },
                accepted: { $sum: { $cond: [{ $in: ['$qualityStatus', ACCEPTED_STATUSES] }, 1, 0] } },
                quarantined: { $sum: { $cond: [{ $eq: ['$qualityStatus', 'QUARANTINED'] }, 1, 0] } },
                voided: { $sum: { $cond: [{ $eq: ['$qualityStatus', 'VOIDED'] }, 1, 0] } },
              }
            }
          ]),
          SensorInstallation.countDocuments({ projectId, status: 'ACTIVE' })
        ]);

        const obs = obsStats[0] || { total: 0, accepted: 0, quarantined: 0, voided: 0 };
        const acceptanceRate = obs.total > 0
          ? ((obs.accepted / obs.total) * 100).toFixed(1) + '%'
          : 'N/A';

        // Current open period completeness
        const openPeriod = periods.find(p => p.status === 'OPEN');
        const currentPeriodCompleteness = openPeriod?.completenessSnapshot?.completenessPercent
          ? openPeriod.completenessSnapshot.completenessPercent.toFixed(1) + '%'
          : 'N/A';

        // Total net tCO2e from calculation runs (if any stored in completenessSnapshot)
        const totalNetReduction = periods.reduce((sum, p) => {
          return sum + (p.completenessSnapshot?.netReduction_tco2e || 0);
        }, 0);

        return {
          projectId,
          projectName: project?.name || '',
          status: project?.status || '',
          totalPeriods: periods.length,
          openPeriods: periods.filter(p => p.status === 'OPEN').length,
          closedPeriods: periods.filter(p => p.status === 'CLOSED' || p.status === 'CALCULATION_COMPLETE').length,
          totalObservations: obs.total,
          acceptedObservations: obs.accepted,
          quarantinedObservations: obs.quarantined,
          voidedObservations: obs.voided,
          acceptanceRate,
          totalNetReduction_tco2e: parseFloat(totalNetReduction.toFixed(4)),
          activeSensors: installations,
          currentPeriodId: openPeriod?.monitoringPeriodId || null,
          currentPeriodCompleteness,
          generatedAt: new Date().toISOString()
        };
      },
      300 // 5-minute TTL
    );
  }

  /**
   * Time-series aggregation of sensor readings.
   * granularity: 'daily' | 'weekly' | 'monthly'
   * metric: field in measurements object (e.g. 'lpg_consumed_kg', 'eco2', 'ch4', 'co')
   */
  async getTimeSeries({ projectId, from, to, granularity = 'daily', metric = 'lpg_consumed_kg', auid }) {
    const match = { projectId, qualityStatus: { $in: ACCEPTED_STATUSES } };
    if (from || to) {
      match.observedAt = {};
      if (from) match.observedAt.$gte = new Date(from);
      if (to)   match.observedAt.$lte = new Date(to);
    }
    if (auid) match.auid = auid;

    const granMap = {
      daily:   { year: { $year: '$observedAt' }, month: { $month: '$observedAt' }, day: { $dayOfMonth: '$observedAt' } },
      weekly:  { year: { $year: '$observedAt' }, week: { $isoWeek: '$observedAt' } },
      monthly: { year: { $year: '$observedAt' }, month: { $month: '$observedAt' } }
    };
    const dateGroup = granMap[granularity] || granMap.daily;

    const metricField = `$measurements.${metric}`;

    const pipeline = [
      { $match: match },
      { $group: {
          _id: dateGroup,
          sum:   { $sum: metricField },
          avg:   { $avg: metricField },
          min:   { $min: metricField },
          max:   { $max: metricField },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 } },
      { $project: {
          _id: 0,
          period: '$_id',
          sum:   { $round: ['$sum', 4] },
          avg:   { $round: ['$avg', 4] },
          min:   { $round: ['$min', 4] },
          max:   { $round: ['$max', 4] },
          count: 1
        }
      }
    ];

    const results = await MRVObservation.aggregate(pipeline);
    return { projectId, metric, granularity, from, to, series: results };
  }

  /**
   * Per-device performance stats for a monitoring period.
   */
  async getDevicePerformance({ projectId, monitoringPeriodId }) {
    const match = { projectId };
    if (monitoringPeriodId) match.monitoringPeriodId = monitoringPeriodId;

    const pipeline = [
      { $match: match },
      { $group: {
          _id: '$auid',
          total:      { $sum: 1 },
          accepted:   { $sum: { $cond: [{ $in: ['$qualityStatus', ACCEPTED_STATUSES] }, 1, 0] } },
          quarantined:{ $sum: { $cond: [{ $eq: ['$qualityStatus', 'QUARANTINED'] }, 1, 0] } },
          voided:     { $sum: { $cond: [{ $eq: ['$qualityStatus', 'VOIDED'] }, 1, 0] } },
          firstSeen:  { $min: '$observedAt' },
          lastSeen:   { $max: '$observedAt' },
        }
      },
      { $project: {
          _id: 0,
          auid: '$_id',
          total: 1, accepted: 1, quarantined: 1, voided: 1,
          firstSeen: 1, lastSeen: 1,
          acceptanceRate: {
            $cond: [
              { $gt: ['$total', 0] },
              { $round: [{ $multiply: [{ $divide: ['$accepted', '$total'] }, 100] }, 1] },
              0
            ]
          }
        }
      },
      { $sort: { accepted: -1 } }
    ];

    const devices = await MRVObservation.aggregate(pipeline);
    return { projectId, monitoringPeriodId: monitoringPeriodId || null, devices };
  }

  /**
   * Organisation-level portfolio overview.
   */
  async getPortfolioOverview(organizationId) {
    return CacheService.getOrSet(
      `mrv:analytics:portfolio:${organizationId}`,
      async () => {
        const projects = await MRVProject.find({ organizationId, deletedAt: null }).lean();
        const projectIds = projects.map(p => p.projectId);

        const [obsStats, activeSensors, openPeriods] = await Promise.all([
          MRVObservation.aggregate([
            { $match: { projectId: { $in: projectIds } } },
            { $group: {
                _id: null,
                total:    { $sum: 1 },
                accepted: { $sum: { $cond: [{ $in: ['$qualityStatus', ACCEPTED_STATUSES] }, 1, 0] } }
              }
            }
          ]),
          SensorInstallation.countDocuments({ projectId: { $in: projectIds }, status: 'ACTIVE' }),
          MonitoringPeriod.countDocuments({ projectId: { $in: projectIds }, status: 'OPEN' })
        ]);

        const obs = obsStats[0] || { total: 0, accepted: 0 };
        return {
          organizationId,
          totalProjects:       projects.length,
          activeProjects:      projects.filter(p => p.status === 'MONITORING').length,
          totalObservations:   obs.total,
          acceptedObservations: obs.accepted,
          openMonitoringPeriods: openPeriods,
          activeSensors,
          generatedAt: new Date().toISOString()
        };
      },
      300
    );
  }
  /**
   * MRV operations overview for the portal landing page.
   * Organization-scoped internally, but presented to users as workspace/portfolio status.
   */
  async getOperationsOverview(organizationId) {
    return CacheService.getOrSet(
      `mrv:analytics:operations-overview:${organizationId}`,
      async () => {
        const projects = (await MRVProject
          .find({ organizationId, deletedAt: null })
          .lean())
          .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
        const projectIds = projects.map(p => p.projectId);
        const empty = {
          organizationId,
          generatedAt: new Date().toISOString(),
          warning: 'This result has not yet been independently verified or approved by Verra.',
          summary: {
            totalProjects: 0,
            activeProjects: 0,
            inactiveProjects: 0,
            totalSites: 0,
            activeDevices: 0,
            maintenanceDevices: 0,
            totalDevices: 0,
            totalObservations: 0,
            acceptedObservations: 0,
            acceptedObservationRate: 0,
            pendingReviewObservations: 0,
            quarantinedObservations: 0,
            evidenceRecords: 0,
            pendingEvidence: 0,
            openMonitoringPeriods: 0,
            calculationRuns: 0,
            approvedCalculations: 0,
            verraApprovedCalculations: 0
          },
          charts: {
            projectStatus: [],
            deviceStatus: [],
            observationQuality: [],
            monitoringPeriodStatus: [],
            evidenceStatus: [],
            calculationStatus: []
          },
          dataQuality: {
            acceptedObservationRate: 0,
            acceptedObservations: 0,
            pendingReviewObservations: 0,
            quarantinedObservations: 0,
            rejectedObservations: 0,
            voidedObservations: 0
          },
          projects: []
        };
        if (projectIds.length === 0) return empty;

        const [
          projectStatusRows,
          siteCount,
          installationStatusRows,
          observationStatusRows,
          periodStatusRows,
          evidenceStatusRows,
          calculationStatusRows,
          observationsByProject,
          periodsByProject,
          installationsByProject,
          evidenceByProject,
          latestCalculations
        ] = await Promise.all([
          MRVProject.aggregate([
            { $match: { organizationId, deletedAt: null } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ]),
          MRVSite.countDocuments({ organizationId, deletedAt: null }),
          SensorInstallation.aggregate([
            { $match: { organizationId, projectId: { $in: projectIds } } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ]),
          MRVObservation.aggregate([
            { $match: { organizationId, projectId: { $in: projectIds } } },
            { $group: { _id: '$qualityStatus', count: { $sum: 1 } } },
          ]),
          MonitoringPeriod.aggregate([
            { $match: { organizationId, projectId: { $in: projectIds } } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ]),
          ExternalEvidenceRecord.aggregate([
            { $match: { organizationId, projectId: { $in: projectIds } } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ]),
          CalculationRun.aggregate([
            { $match: { organizationId, projectId: { $in: projectIds } } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ]),
          MRVObservation.aggregate([
            { $match: { organizationId, projectId: { $in: projectIds } } },
            { $group: {
              _id: '$projectId',
              totalObservations: { $sum: 1 },
              acceptedObservations: { $sum: { $cond: [{ $in: ['$qualityStatus', ACCEPTED_STATUSES] }, 1, 0] } },
              pendingObservations: { $sum: { $cond: [{ $eq: ['$qualityStatus', 'PENDING'] }, 1, 0] } },
              quarantinedObservations: { $sum: { $cond: [{ $eq: ['$qualityStatus', 'QUARANTINED'] }, 1, 0] } },
              lastObservationAt: { $max: '$observedAt' }
            } }
          ]),
          MonitoringPeriod.aggregate([
            { $match: { organizationId, projectId: { $in: projectIds } } },
            { $group: {
              _id: '$projectId',
              totalMonitoringPeriods: { $sum: 1 },
              openMonitoringPeriods: { $sum: { $cond: [{ $eq: ['$status', 'OPEN'] }, 1, 0] } },
              closedMonitoringPeriods: { $sum: { $cond: [{ $in: ['$status', ['CLOSED', 'CALCULATION_COMPLETE', 'CALCULATION_APPROVED', 'SUBMITTED', 'VERIFIED']] }, 1, 0] } }
            } }
          ]),
          SensorInstallation.aggregate([
            { $match: { organizationId, projectId: { $in: projectIds } } },
            { $group: {
              _id: '$projectId',
              totalDevices: { $sum: 1 },
              activeDevices: { $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] } },
              maintenanceDevices: { $sum: { $cond: [{ $eq: ['$status', 'MAINTENANCE'] }, 1, 0] } }
            } }
          ]),
          ExternalEvidenceRecord.aggregate([
            { $match: { organizationId, projectId: { $in: projectIds } } },
            { $group: {
              _id: '$projectId',
              evidenceRecords: { $sum: 1 },
              pendingEvidence: { $sum: { $cond: [{ $eq: ['$status', 'PENDING_REVIEW'] }, 1, 0] } },
              acceptedEvidence: { $sum: { $cond: [{ $in: ['$status', ['ACCEPTED', 'ACCEPTED_WITH_WARNING']] }, 1, 0] } }
            } }
          ]),
          CalculationRun
            .find({ organizationId, projectId: { $in: projectIds } }, { projectId: 1, calculationRunId: 1, status: 1, calculatedAt: 1, createdAt: 1, runVersion: 1 })
            .lean()
        ]);

        const installationCounts = countFromAggregation(installationStatusRows);
        const observationCounts = countFromAggregation(observationStatusRows);
        const periodCounts = countFromAggregation(periodStatusRows);
        const evidenceCounts = countFromAggregation(evidenceStatusRows);
        const calculationCounts = countFromAggregation(calculationStatusRows);
        const byProject = rows => rows.reduce((acc, row) => { acc[row._id] = row; return acc; }, {});
        const obsByProject = byProject(observationsByProject);
        const mpByProject = byProject(periodsByProject);
        const installByProject = byProject(installationsByProject);
        const evByProject = byProject(evidenceByProject);
        const calcByProject = latestCalculations
          .sort((a, b) => {
            const dateDelta = new Date(b.createdAt || b.calculatedAt || 0) - new Date(a.createdAt || a.calculatedAt || 0);
            if (dateDelta !== 0) return dateDelta;
            return (b.runVersion || 0) - (a.runVersion || 0);
          })
          .reduce((acc, run) => {
            if (!acc[run.projectId]) {
              acc[run.projectId] = {
                latestCalculationRunId: run.calculationRunId,
                latestCalculationStatus: run.status,
                latestCalculatedAt: run.calculatedAt
              };
            }
            return acc;
          }, {});
        const activeProjects = projects.filter(p => ACTIVE_PROJECT_STATUSES.includes(p.status)).length;
        const acceptedObservations = ACCEPTED_STATUSES.reduce((sum, status) => sum + (observationCounts[status] || 0), 0);
        const totalObservations = Object.values(observationCounts).reduce((sum, count) => sum + count, 0);
        const evidenceRecords = Object.values(evidenceCounts).reduce((sum, count) => sum + count, 0);
        const calculationRuns = Object.values(calculationCounts).reduce((sum, count) => sum + count, 0);
        const chartRows = rows => rows.map(row => ({ status: row._id || 'UNKNOWN', count: row.count })).sort((a, b) => b.count - a.count);

        const projectRows = projects.slice(0, 20).map(project => {
          const obs = obsByProject[project.projectId] || {};
          const periods = mpByProject[project.projectId] || {};
          const installations = installByProject[project.projectId] || {};
          const evidence = evByProject[project.projectId] || {};
          const calculation = calcByProject[project.projectId] || {};
          const counts = { ...obs, ...periods, ...installations, ...evidence, ...calculation };
          const actionState = projectActionState(project, counts);
          return {
            projectId: project.projectId,
            name: project.name,
            status: project.status,
            readinessStatus: project.readinessStatus || null,
            applicabilityStatus: project.applicabilityStatus || null,
            actionState,
            activityType: project.activityType,
            claimType: project.claimType,
            country: project.country,
            region: project.region,
            projectStart: project.projectStart,
            activeDevices: installations.activeDevices || 0,
            totalDevices: installations.totalDevices || 0,
            totalObservations: obs.totalObservations || 0,
            acceptedObservationRate: percent(obs.acceptedObservations || 0, obs.totalObservations || 0),
            openMonitoringPeriods: periods.openMonitoringPeriods || 0,
            pendingEvidence: evidence.pendingEvidence || 0,
            latestCalculationStatus: calculation.latestCalculationStatus || null,
            latestCalculatedAt: calculation.latestCalculatedAt || null,
            lastObservationAt: obs.lastObservationAt || null,
            nextAction: projectNextAction(project, counts)
          };
        });

        const readinessReadyProjects = projectRows.filter(project => project.readinessStatus === 'READY').length;
        const projectsRequiringAction = projectRows.filter(project => project.actionState === 'BLOCKED').length;

        return {
          organizationId,
          generatedAt: new Date().toISOString(),
          warning: 'This result has not yet been independently verified or approved by Verra.',
          summary: {
            totalProjects: projects.length,
            activeProjects,
            inactiveProjects: projects.length - activeProjects,
            readinessReadyProjects,
            projectsRequiringAction,
            totalSites: siteCount,
            activeDevices: installationCounts.ACTIVE || 0,
            maintenanceDevices: installationCounts.MAINTENANCE || 0,
            totalDevices: Object.values(installationCounts).reduce((sum, count) => sum + count, 0),
            totalObservations,
            acceptedObservations,
            acceptedObservationRate: percent(acceptedObservations, totalObservations),
            pendingReviewObservations: observationCounts.PENDING || 0,
            quarantinedObservations: observationCounts.QUARANTINED || 0,
            evidenceRecords,
            pendingEvidence: evidenceCounts.PENDING_REVIEW || 0,
            openMonitoringPeriods: periodCounts.OPEN || 0,
            calculationRuns,
            approvedCalculations: calculationCounts.APPROVED_FOR_SUBMISSION || 0,
            verraApprovedCalculations: calculationCounts.VERRA_APPROVED || 0
          },
          charts: {
            projectStatus: chartRows(projectStatusRows),
            deviceStatus: chartRows(installationStatusRows),
            observationQuality: chartRows(observationStatusRows),
            monitoringPeriodStatus: chartRows(periodStatusRows),
            evidenceStatus: chartRows(evidenceStatusRows),
            calculationStatus: chartRows(calculationStatusRows)
          },
          dataQuality: {
            acceptedObservationRate: percent(acceptedObservations, totalObservations),
            acceptedObservations,
            pendingReviewObservations: observationCounts.PENDING || 0,
            quarantinedObservations: observationCounts.QUARANTINED || 0,
            rejectedObservations: observationCounts.REJECTED || 0,
            voidedObservations: observationCounts.VOIDED || 0
          },
          projects: projectRows
        };
      },
      120
    );
  }
}

module.exports = new MRVAnalyticsService();



