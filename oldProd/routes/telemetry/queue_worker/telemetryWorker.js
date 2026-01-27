// workers/telemetryWorker.js
const { Worker } = require('bullmq');
const dotenv = require('dotenv');
const path = require('path');
const { handleEnvQueuedTelemetry } = require("../handlers/handleEnvQueuedTelemetry");
const { handleGasSoloQueuedTelemetry } = require("../handlers/handleSoloGasQueuedTelemetry");
const { handleAquaQueuedTelemetry } = require('../handlers/handleAquaQueuedTelemetry');

function startTelemetryWorker() {
 let envFile;

if (process.env.NODE_ENV === 'development') {
  envFile = '.env.development';
} else {
  envFile = '.env';   // default for production or if NODE_ENV not set
}

dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });

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
      const devid = body.devid;
     console.log("Devvvvvvv.....", devid)
      if (devid == '2af0' || devid == '2af1' || devid == '2af2' ) {
        console.log('🌿 Processing Afriset ENV telemetry');
        await handleEnvQueuedTelemetry(data);
        return;
      }

      if (devmod === 'ENV') {
        console.log('🌿 Processing ENV telemetry');
        await handleEnvQueuedTelemetry(data);
        return;
      }

      if (devmod === 'AQUA') {
        console.log('🌿 Processing AQUA telemetry');
        await handleAquaQueuedTelemetry(data)
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
    //1
    {
      connection,
      removeOnComplete: { age: 60, count: 1000 },
      // ⬇️ Keep failed jobs very briefly to avoid Redis pile-up
      removeOnFail: { age: 5 }, // auto-remove failed jobs ~5s after final failure
      concurrency: 5,
      lockDuration: 30000,
    }
  );

  worker.on('completed', job => console.log(`✅ Job ${job.id} completed`));
  worker.on('failed', (job, err) => console.error(`❌ Job ${job?.id} failed:`, err.message));
  worker.on('error', err => console.error(`🚨 Worker error:`, err));

  return worker;
}

module.exports = { startTelemetryWorker };
