'use strict';
const { Worker } = require('bullmq');
const { processDelivery } = require('../../services/mrv/mrvWebhookService');
const logger = require('../../utils/logger');

function startMRVWebhookWorker() {
  const connection = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    keepAlive: 30000,
    maxRetriesPerRequest: null,
  };

  const worker = new Worker('mrv-webhook', async (job) => {
    return await processDelivery(job.data);
  }, {
    connection,
    concurrency: 10,
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail:     { age: 604800 }, // keep failed for 7 days for debugging
  });

  worker.on('completed', (job) => {
    logger.info(`[MRVWebhookWorker] Delivered: ${job.id}`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[MRVWebhookWorker] Failed: ${job?.id} attempt=${job?.attemptsMade} — ${err.message}`);
    // After all retries exhausted, mark delivery as ABANDONED
    if (job && job.attemptsMade >= job.opts.attempts) {
      const MRVWebhookDelivery = require('../../models/mrv/outbound/MRVWebhookDelivery.model');
      MRVWebhookDelivery.findOneAndUpdate(
        { deliveryId: job.data.deliveryId },
        { $set: { status: 'ABANDONED', errorMessage: `All ${job.opts.attempts} attempts failed. Last: ${err.message}` } }
      ).catch(() => {});
    }
  });

  worker.on('error', (err) => logger.error('[MRVWebhookWorker] Worker error:', err));

  console.log('✅ MRV Webhook Worker started');
  return worker;
}

module.exports = { startMRVWebhookWorker };
