'use strict';
const { Worker } = require('bullmq');
const logger = require('../../utils/logger');

function startMRVReportWorker() {
  const connection = { host: process.env.REDIS_HOST || '127.0.0.1', port: parseInt(process.env.REDIS_PORT || '6379', 10), password: process.env.REDIS_PASSWORD || undefined, keepAlive: 30000, maxRetriesPerRequest: null };
  const worker = new Worker('mrv-report', async (job) => {
    logger.info(`[MRVReport] Report job received: ${job.id} (Phase 2 — stub)`);
    return { stub: true };
  }, { connection, concurrency: 2 });
  worker.on('failed', (job, err) => logger.error(`[MRVReport] Job ${job?.id} failed: ${err.message}`));
  worker.on('error', err => logger.error('[MRVReport] Worker error:', err));
  console.log('✅ MRV Report Worker started (stub)');
  return worker;
}

module.exports = { startMRVReportWorker };
