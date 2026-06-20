'use strict';
const { Worker } = require('bullmq');
const logger = require('../../utils/logger');

function startMRVCalculationWorker() {
  const connection = { host: process.env.REDIS_HOST || '127.0.0.1', port: parseInt(process.env.REDIS_PORT || '6379', 10), password: process.env.REDIS_PASSWORD || undefined, keepAlive: 30000, maxRetriesPerRequest: null };

  const worker = new Worker('mrv-calculation', async (job) => {
    const { calculationRunId, implementationId } = job.data;
    /**
     * BLOCKED: VM0050 implementation mayCalculate = false until all sign-off
     * conditions are met. All jobs are rejected with a clear BLOCKED status.
     * This is intentional — the calculation engine shell is ready but gated.
     */
    const MRVMethodologyImplementation = require('../../models/mrv/catalogue/MRVMethodologyImplementation.model');
    const CalculationRun = require('../../models/mrv/accounting/CalculationRun.model');
    const impl = await MRVMethodologyImplementation.findOne({ implementationId }).lean();
    if (!impl || !impl.mayCalculate) {
      const reason = impl
        ? `Implementation ${implementationId} has mayCalculate=false. Pending: ${(impl.requiresSignOffConditions || []).join('; ')}`
        : `Implementation ${implementationId} not found`;
      await CalculationRun.findOneAndUpdate({ calculationRunId }, { $set: { status: 'FAILED', failureReason: reason } });
      logger.warn(`[MRVCalculation] BLOCKED: ${reason}`);
      return { blocked: true, reason };
    }
    // Phase 2: dynamic methodology invocation will live here
    logger.info(`[MRVCalculation] Calculation ${calculationRunId} received — dispatching to implementation ${implementationId}`);
    throw new Error('Calculation engine not yet implemented — awaiting sign-off');
  }, { connection, concurrency: 2, removeOnComplete: { age: 86400, count: 100 }, removeOnFail: { age: 604800 } });

  worker.on('failed', (job, err) => logger.error(`[MRVCalculation] Job ${job?.id} failed: ${err.message}`));
  worker.on('error', err => logger.error('[MRVCalculation] Worker error:', err));
  console.log('✅ MRV Calculation Worker started (BLOCKED — pending sign-off)');
  return worker;
}

module.exports = { startMRVCalculationWorker };
