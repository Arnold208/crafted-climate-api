// workers/telemetryWorker.js

const { Worker } = require('bullmq');
const dotenv = require('dotenv');
const path = require('path');
const { handleEnvQueuedTelemetry } = require("../handlers/handleEnvQueuedTelemetry");

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
      const data = job.data;
      const devmod = data?.body?.devmod;

      if (devmod === 'ENV') {
        console.log('🌿 Processing ENV telemetry');
        await handleEnvQueuedTelemetry(data);
      } else {
        console.warn(`⚠️ Unsupported device type: ${devmod || 'unknown'}, skipping...`);
      }
    },
    { connection }
  );

  worker.on('completed', job => {
    console.log(`✅ Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', err => {
    console.error(`🚨 Worker error:`, err);
  });

  return worker;
}

module.exports = { startTelemetryWorker };
