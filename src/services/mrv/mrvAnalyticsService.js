'use strict';
const MRVObservation = require('../../models/mrv/evidence/MRVObservation.model');
const MonitoringPeriod = require('../../models/mrv/monitoring/MonitoringPeriod.model');
const MRVProject = require('../../models/mrv/project/MRVProject.model');
const SensorInstallation = require('../../models/mrv/evidence/SensorInstallation.model');
const CacheService = require('../../modules/common/cache.service');

const ACCEPTED_STATUSES = ['ACCEPTED', 'ACCEPTED_WITH_WARNING', 'MANUALLY_APPROVED'];

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
}

module.exports = new MRVAnalyticsService();
