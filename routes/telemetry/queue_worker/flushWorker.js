// routes/telemetry/queue_worker/flushWorker.js
const { Worker } = require('bullmq');
const path = require('path');
const dotenv = require('dotenv');
let envFile;

if (process.env.NODE_ENV === 'development') {
  envFile = '.env.development';
} else {
  envFile = '.env';   // default for production or if NODE_ENV not set
}

dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });
const { flushTelemetryToMongo } = require('../../../utils/flushTelemetryToMongo');
const EnvTelemetry = require('../../../model/telemetry/envModel');
const GasSoloTelemetry = require('../../../model/telemetry/gasSoloModel');

const MODEL_MAP = {
  'env': EnvTelemetry,
  'environment': EnvTelemetry,
  'crowdsense-env': EnvTelemetry,
  'gas-solo': GasSoloTelemetry,
  'gassolo': GasSoloTelemetry,
};

function startFlushWorker() {
  const connection = process.env.REDIS_URL
    ? { url: process.env.REDIS_URL }
    : {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
      };

  const worker = new Worker(
    'flush-telem',
    async (job) => {
      if (job.name !== 'flush-auid') return;
      job.discard(); // no retries; function has its own Redis lock per AUID

      const { auid, model } = job.data || {};
      if (!auid) return;

      const mongoModel = MODEL_MAP[(model || '').toLowerCase()];
      if (!mongoModel) return;

      await flushTelemetryToMongo(String(auid), mongoModel);
    },
    {
      connection,
      concurrency: parseInt(process.env.FLUSH_WORKER_CONCURRENCY || '8', 10),
      removeOnComplete: { age: 86400, count: 10000 }, // keep 24h
      removeOnFail:     { age: 86400, count: 1000  }, // keep 24h
    }
  );

  worker.on('completed', (job) => console.log(`🧾 Flushed: ${job.id}`));
  worker.on('failed', (job, err) => console.error(`❌ Flush failed ${job?.id}:`, err?.message));
  worker.on('error',  (err)      => console.error('🚨 Flush worker error:', err?.message));

  return worker;
}

module.exports = { startFlushWorker };
