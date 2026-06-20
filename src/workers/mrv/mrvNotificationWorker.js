'use strict';
const { Worker } = require('bullmq');
const mrvNotifService = require('../../services/mrv/mrvNotificationService');
const logger = require('../../utils/logger');

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

function startMRVNotificationWorker() {
  const worker = new Worker('mrv-notifications', async (job) => {
    const { type } = job.data;
    logger.info(`[MRVNotifWorker] Processing job ${job.id} type=${type}`);

    switch (type) {
      case 'DATA_GAP':
        await mrvNotifService.sendDataGapAlert(job.data);
        break;
      case 'COMPLETENESS':
        await mrvNotifService.sendCompletenessAlert(job.data);
        break;
      case 'QUARANTINE_DIGEST':
        await mrvNotifService.sendQuarantineDigest(job.data);
        break;
      case 'VVB_DEADLINE_REMINDER':
        await mrvNotifService.sendVerificationReminder(job.data);
        break;
      default:
        logger.warn(`[MRVNotifWorker] Unknown notification type: ${type}`);
    }
  }, {
    connection,
    concurrency: 3,
    removeOnComplete: { count: 500 },
    removeOnFail: { age: 7 * 24 * 3600 }
  });

  worker.on('completed', job => logger.debug(`[MRVNotifWorker] Job ${job.id} completed`));
  worker.on('failed', (job, err) => logger.error(`[MRVNotifWorker] Job ${job?.id} failed: ${err.message}`));
  worker.on('error', err => logger.error('[MRVNotifWorker] Worker error:', err));

  logger.info('MRV Notification Worker started');
  return worker;
}

module.exports = { startMRVNotificationWorker };
