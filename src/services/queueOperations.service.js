'use strict';

const { Queue } = require('bullmq');
const { listWorkers } = require('./workerRuntime.service');

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  keepAlive: 30000,
  maxRetriesPerRequest: null
};

const ALLOWED_QUEUES = new Set([
  'telemetry',
  'status',
  'mrv-evidence',
  'mrv-observation',
  'mrv-validation',
  'mrv-qualification',
  'mrv-completeness',
  'mrv-readiness',
  'mrv-calculation',
  'mrv-report',
  'mrv-notifications',
  'mrv-webhook'
]);

function assertQueueName(name) {
  if (!ALLOWED_QUEUES.has(name)) {
    const allowed = Array.from(ALLOWED_QUEUES).sort().join(', ');
    throw new Error(`Unsupported queue "${name}". Allowed queues: ${allowed}`);
  }
}

function openQueue(name) {
  assertQueueName(name);
  return new Queue(name, { connection });
}

async function getQueueSummary(name, failedLimit = 5) {
  const queue = openQueue(name);
  try {
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'paused');
    const failedJobs = await queue.getFailed(0, Math.max(0, failedLimit - 1));
    return {
      name,
      counts,
      failedSamples: failedJobs.map((job) => ({
        id: job.id,
        name: job.name,
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn
      }))
    };
  } finally {
    await queue.close();
  }
}

async function getQueuesHealth() {
  const queues = [];
  for (const name of ALLOWED_QUEUES) {
    queues.push(await getQueueSummary(name, 3));
  }

  const workers = listWorkers();
  const failedQueues = queues.filter((queue) => (queue.counts.failed || 0) > 0).length;
  const activeWorkers = workers.filter((worker) => ['running', 'degraded'].includes(worker.status)).length;

  return {
    status: failedQueues > 0 ? 'degraded' : 'operational',
    activeWorkers,
    workerCount: workers.length,
    failedQueues,
    workers,
    queues
  };
}

async function retryFailedJobs(name, limit = 100) {
  const queue = openQueue(name);
  const max = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const result = { queue: name, requestedLimit: max, retried: 0, skipped: 0, errors: [] };

  try {
    const jobs = await queue.getFailed(0, max - 1);
    for (const job of jobs) {
      try {
        await job.retry();
        result.retried += 1;
      } catch (err) {
        result.skipped += 1;
        result.errors.push({ jobId: job.id, error: err.message });
      }
    }
    return result;
  } finally {
    await queue.close();
  }
}

module.exports = {
  ALLOWED_QUEUES,
  getQueueSummary,
  getQueuesHealth,
  retryFailedJobs
};