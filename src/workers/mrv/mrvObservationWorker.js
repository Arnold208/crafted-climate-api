'use strict';
const { Worker } = require('bullmq');
const { v4: uuidv4 } = require('uuid');
const { updateReceiptStatus } = require('../../services/mrv/mrvIdempotencyService');
const { mrvValidationQueue } = require('./queues');
const MRVObservation = require('../../models/mrv/evidence/MRVObservation.model');
const logger = require('../../utils/logger');

function startMRVObservationWorker() {
  const connection = { host: process.env.REDIS_HOST || '127.0.0.1', port: parseInt(process.env.REDIS_PORT || '6379', 10), password: process.env.REDIS_PASSWORD || undefined, keepAlive: 30000, maxRetriesPerRequest: null };

  const worker = new Worker('mrv-observation', async (job) => {
    const { ingestionId, receiptId, envelope } = job.data;

    const existing = await MRVObservation.findOne({ ingestionId }).lean();
    if (existing) {
      logger.debug(`[MRVObservation] Already exists for ingestionId ${ingestionId}`);
      return { observationId: existing.observationId };
    }

    const { auid, model, organizationId, projectIds, receivedAt, observedAt, timeSource, clockQuality, body } = envelope;

    // envelope.body = the full raw ingest payload (req.body).
    // Sensor readings are nested inside rawEvent.body (the 'body' field of the ingest event).
    // monitoringPeriodId is at the top level of the raw ingest payload.
    const rawEvent      = body || {};
    const sensorReadings = rawEvent.body || {};        // nested sensor readings object
    const monitoringPeriodId = rawEvent.monitoringPeriodId || null;

    // Dynamic measurement extraction — only numeric values from the sensor readings object
    const measurements = {};
    const derivedValues = {};
    for (const [key, val] of Object.entries(sensorReadings)) {
      if (typeof val === 'number') measurements[key] = val;
    }
    if (measurements.aqi     !== undefined) derivedValues.aqi     = measurements.aqi;
    if (measurements.battery !== undefined) derivedValues.battery = measurements.battery;

    const observationId = `OBS-${uuidv4()}`;
    await MRVObservation.create({
      observationId, receiptId, ingestionId,
      projectId: projectIds?.[0] || null,
      monitoringPeriodId,
      auid, model, organizationId,
      observedAt: observedAt ? new Date(observedAt) : null,
      receivedAt: new Date(receivedAt),
      timeSource, clockQuality,
      measurements, derivedValues,
      normalizationVersion: '1.0.0',
      qualityStatus: 'PENDING'
    });

    await updateReceiptStatus(ingestionId, 'OBSERVATION_CREATED', { observationId });
    await mrvValidationQueue.add('validation', { observationId, ingestionId }, {
      jobId: `val-${observationId}`, attempts: 3, backoff: { type: 'exponential', delay: 1000 }
    });

    // Fire outbound webhook (non-blocking — never affects pipeline)
    try {
      const { dispatchWebhookEvent } = require('../../services/mrv/mrvWebhookService');
      const targetProjectId = projectIds?.[0] || null;
      if (targetProjectId) {
        dispatchWebhookEvent(targetProjectId, 'observation.created', {
          observationId, ingestionId, auid, model, observedAt, organizationId,
        });
      }
    } catch (_) {}

    logger.info(`[MRVObservation] Created: ${observationId}`);
    return { observationId };
  }, { connection, concurrency: 20, removeOnComplete: { age: 3600, count: 500 }, removeOnFail: { age: 86400 } });

  worker.on('failed', (job, err) => logger.error(`[MRVObservation] Job ${job?.id} failed: ${err.message}`));
  worker.on('error', err => logger.error('[MRVObservation] Worker error:', err));
  console.log('✅ MRV Observation Worker started');
  return worker;
}

module.exports = { startMRVObservationWorker };
