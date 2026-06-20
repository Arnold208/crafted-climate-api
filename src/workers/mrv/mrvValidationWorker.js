'use strict';
const { Worker } = require('bullmq');
const { v4: uuidv4 } = require('uuid');
const MRVObservation = require('../../models/mrv/evidence/MRVObservation.model');
const MRVValidationRun = require('../../models/mrv/evidence/MRVValidationRun.model');
const { mrvQualificationQueue } = require('./queues');
const logger = require('../../utils/logger');

const RUNNER_VERSION = '1.0.0';

function runChecks(obs) {
  const checks = [];
  // CLOCK: observedAt must be present
  checks.push({
    checkCode: 'CLOCK_QUALITY',
    result: obs.clockQuality === 'trusted' || obs.clockQuality === 'synchronised' ? 'PASS' : obs.observedAt ? 'WARNING' : 'FAIL',
    message: `Clock quality: ${obs.clockQuality}`, value: obs.clockQuality, threshold: 'trusted|synchronised'
  });
  // STALENESS: reject if > 24h old when received
  const ageSec = obs.observedAt ? (new Date(obs.receivedAt) - new Date(obs.observedAt)) / 1000 : null;
  checks.push({
    checkCode: 'STALENESS',
    result: ageSec === null ? 'SKIPPED' : ageSec > 86400 ? 'FAIL' : ageSec > 7200 ? 'WARNING' : 'PASS',
    message: ageSec !== null ? `Age: ${Math.round(ageSec)}s` : 'No observedAt', value: ageSec, threshold: 86400
  });
  // HAS MEASUREMENTS: at least one numeric value
  const hasMeasurements = Object.keys(obs.measurements || {}).length > 0;
  checks.push({ checkCode: 'HAS_MEASUREMENTS', result: hasMeasurements ? 'PASS' : 'FAIL', message: hasMeasurements ? 'Measurements present' : 'No measurements found', value: Object.keys(obs.measurements || {}).length, threshold: 1 });
  // NUMERIC BOUNDS: no NaN or Infinity
  const badValues = Object.entries(obs.measurements || {}).filter(([, v]) => !isFinite(v));
  checks.push({ checkCode: 'NUMERIC_BOUNDS', result: badValues.length === 0 ? 'PASS' : 'FAIL', message: badValues.length > 0 ? `Invalid values: ${badValues.map(([k]) => k).join(', ')}` : 'All values finite', value: badValues.length, threshold: 0 });

  const hasFail = checks.some(c => c.result === 'FAIL');
  const hasWarn = checks.some(c => c.result === 'WARNING');
  const overallResult = hasFail ? 'QUARANTINED' : hasWarn ? 'ACCEPTED_WITH_WARNING' : 'ACCEPTED';
  return { checks, overallResult };
}

function startMRVValidationWorker() {
  const connection = { host: process.env.REDIS_HOST || '127.0.0.1', port: parseInt(process.env.REDIS_PORT || '6379', 10), password: process.env.REDIS_PASSWORD || undefined, keepAlive: 30000, maxRetriesPerRequest: null };

  const worker = new Worker('mrv-validation', async (job) => {
    const { observationId } = job.data;
    const obs = await MRVObservation.findOne({ observationId }).lean();
    if (!obs) { logger.warn(`[MRVValidation] Observation not found: ${observationId}`); return; }

    const { checks, overallResult } = runChecks(obs);
    const statusMap = { ACCEPTED: 'ACCEPTED', ACCEPTED_WITH_WARNING: 'ACCEPTED_WITH_WARNING', QUARANTINED: 'QUARANTINED', REJECTED: 'REJECTED' };
    const runId = `VALRUN-${uuidv4()}`;
    await MRVValidationRun.create({ runId, observationId, checks, overallResult, runnerVersion: RUNNER_VERSION });
    const qualityStatus = statusMap[overallResult] || 'QUARANTINED';
    const qualityWarnings = checks.filter(c => c.result === 'WARNING').map(c => c.message);
    await MRVObservation.findOneAndUpdate({ observationId }, { $set: { qualityStatus, qualityWarnings, validationRunId: runId } });
    await mrvQualificationQueue.add('qualification', { observationId, runId }, { jobId: `qual-${observationId}`, attempts: 3 });
    logger.info(`[MRVValidation] ${observationId}: ${overallResult}`);
    return { runId, overallResult };
  }, { connection, concurrency: 20, removeOnComplete: { age: 3600, count: 500 }, removeOnFail: { age: 86400 } });

  worker.on('failed', (job, err) => logger.error(`[MRVValidation] Job ${job?.id} failed: ${err.message}`));
  worker.on('error', err => logger.error('[MRVValidation] Worker error:', err));
  console.log('✅ MRV Validation Worker started');
  return worker;
}

module.exports = { startMRVValidationWorker };
