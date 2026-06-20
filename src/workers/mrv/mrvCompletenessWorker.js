'use strict';
const { Worker } = require('bullmq');
const MRVObservation = require('../../models/mrv/evidence/MRVObservation.model');
const MonitoringPeriod = require('../../models/mrv/monitoring/MonitoringPeriod.model');
const logger = require('../../utils/logger');

function startMRVCompletenessWorker() {
  const connection = { host: process.env.REDIS_HOST || '127.0.0.1', port: parseInt(process.env.REDIS_PORT || '6379', 10), password: process.env.REDIS_PASSWORD || undefined, keepAlive: 30000, maxRetriesPerRequest: null };

  const worker = new Worker('mrv-completeness', async (job) => {
    const { projectId, monitoringPeriodId } = job.data;
    const period = await MonitoringPeriod.findOne({ monitoringPeriodId }).lean();
    if (!period) { logger.warn(`[MRVCompleteness] Period not found: ${monitoringPeriodId}`); return; }

    const [total, accepted, quarantined] = await Promise.all([
      MRVObservation.countDocuments({ projectId, monitoringPeriodId }),
      MRVObservation.countDocuments({ projectId, monitoringPeriodId, qualityStatus: { $in: ['ACCEPTED', 'ACCEPTED_WITH_WARNING'] } }),
      MRVObservation.countDocuments({ projectId, monitoringPeriodId, qualityStatus: 'QUARANTINED' })
    ]);

    const completenessSnapshot = {
      total, accepted, quarantined, rejected: total - accepted - quarantined,
      completenessRatio: total > 0 ? (accepted / total) : 0,
      calculatedAt: new Date()
    };
    await MonitoringPeriod.findOneAndUpdate({ monitoringPeriodId }, { $set: { completenessSnapshot } });
    logger.info(`[MRVCompleteness] ${monitoringPeriodId}: ${accepted}/${total} accepted (${(completenessSnapshot.completenessRatio * 100).toFixed(1)}%)`);
    return completenessSnapshot;
  }, { connection, concurrency: 5 });

  worker.on('failed', (job, err) => logger.error(`[MRVCompleteness] Job ${job?.id} failed: ${err.message}`));
  worker.on('error', err => logger.error('[MRVCompleteness] Worker error:', err));
  console.log('✅ MRV Completeness Worker started');
  return worker;
}

module.exports = { startMRVCompletenessWorker };
