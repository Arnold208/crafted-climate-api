'use strict';
const { Queue } = require('bullmq');

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  keepAlive: 30000,
  maxRetriesPerRequest: null
};

const defaultJobOptions = { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: { age: 3600, count: 500 }, removeOnFail: { age: 86400 } };
const qOpts = { connection, defaultJobOptions };

const mrvEvidenceQueue       = new Queue('mrv-evidence', qOpts);
const mrvObservationQueue    = new Queue('mrv-observation', qOpts);
const mrvValidationQueue     = new Queue('mrv-validation', qOpts);
const mrvQualificationQueue  = new Queue('mrv-qualification', qOpts);
const mrvCompletenessQueue   = new Queue('mrv-completeness', qOpts);
const mrvReadinessQueue      = new Queue('mrv-readiness', qOpts);
const mrvCalculationQueue    = new Queue('mrv-calculation', { ...qOpts, defaultJobOptions: { ...defaultJobOptions, attempts: 1 } });
const mrvReportQueue         = new Queue('mrv-report', qOpts);
const mrvNotificationQueue   = new Queue('mrv-notifications', qOpts);
const mrvWebhookQueue        = new Queue('mrv-webhook', {
  ...qOpts,
  defaultJobOptions: { ...defaultJobOptions, attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnFail: { age: 604800 } }
});

module.exports = {
  mrvEvidenceQueue, mrvObservationQueue, mrvValidationQueue, mrvQualificationQueue,
  mrvCompletenessQueue, mrvReadinessQueue, mrvCalculationQueue, mrvReportQueue,
  mrvNotificationQueue, mrvWebhookQueue
};
