// workers/telemetryWorker.js
const { Worker } = require('bullmq');
const dotenv = require('dotenv');
const path = require('path');
const { handleEnvQueuedTelemetry } = require("../handlers/handleEnvQueuedTelemetry");
const { handleGasSoloQueuedTelemetry } = require("../handlers/handleSoloGasQueuedTelemetry");

function startTelemetryWorker() {
  const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
  dotenv.config({ path: path.resolve(__dirname, `../../../${envFile}`) });

  const connection = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  };

  const worker = new Worker(
    'telemetry',
    async job => {
      const data = job.data || {};
      const body = data.body;

      // 🔒 Rule: if there's no body, it is NOT telemetry → skip
      if (!body) return;

      // (Optional) light validation; skip if clearly not a datapoint
      if (!body.devid) return;

      const devmod = (body.devmod || '').toUpperCase();

      if (devmod === 'ENV') {
        console.log('🌿 Processing ENV telemetry');
        await handleEnvQueuedTelemetry(data);
        return;
      }

      if (devmod === 'GAS-SOLO') {
        console.log('🧪 Processing GAS-SOLO telemetry');
       await handleGasSoloQueuedTelemetry(data);
        return;
      }

      // Anything with body but unknown devmod → skip quietly (per your rule)
      return;
    },
    {
      connection,
      removeOnComplete: { age: 60, count: 1000 },
      removeOnFail: { age: 3600, count: 100 },
      // concurrency: 5,
      // lockDuration: 30000,
    }
  );

  worker.on('completed', job => console.log(`✅ Job ${job.id} completed`));
  worker.on('failed', (job, err) => console.error(`❌ Job ${job?.id} failed:`, err.message));
  worker.on('error', err => console.error(`🚨 Worker error:`, err));

  return worker;
}

module.exports = { startTelemetryWorker };
