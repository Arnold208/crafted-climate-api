const { Worker } = require('bullmq');
const dotenv = require('dotenv');
const path = require('path');
const { handleEnvQueuedTelemetry } = require("../handlers/handleEnvQueuedTelemetry");
const { handleGasSoloQueuedTelemetry } = require("../handlers/handleSoloGasQueuedTelemetry");
const { handleAquaQueuedTelemetry } = require('../handlers/handleAquaQueuedTelemetry');
// 🔒 PRODUCTION HARDENING: Redis client for deduplication
const { client: redisClient } = require('../../../config/redis/redis');
const logger = require('../../../utils/logger');

function startTelemetryWorker() {
    let envFile;

    if (process.env.NODE_ENV === 'development') {
        envFile = '.env.development';
    } else {
        envFile = '.env';   // default for production or if NODE_ENV not set
    }

    // Adjusted path: src/modules/telemetry/workers -> root (depth 4)
    dotenv.config({ path: path.resolve(__dirname, `../../../../${envFile}`) });

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

            // 🔒 PRODUCTION HARDENING: Idempotency/Deduplication Check
            // Prevent duplicate processing from MQTT retries or job retries
            const timestamp = body.ts || data.receivedAt || Date.now();
            const dedupKey = `seen:${devid}:${timestamp}`;

            try {
                // NX flag: only set if key doesn't exist (returns null if already exists)
                const isNew = await redisClient.set(dedupKey, '1', {
                    EX: 300,  // Expire after 5 minutes
                    NX: true  // Only set if not exists
                });

                if (!isNew) {
                    logger.debug(`⏭️ Skipping duplicate telemetry: ${devid} @ ${timestamp}`);
                    return; // Already processed, skip silently
                }
            } catch (dedupErr) {
                logger.error(`⚠️ Deduplication check failed for ${devid}: %s`, dedupErr.message);
                // Continue processing even if dedup check fails (fail-open)
            }

            //console.log("Devvvvvvv.....", devid)
            if (devid == '2af0' || devid == '2af1' || devid == '2af2') {
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
        // 🔥 PRODUCTION HARDENING: Worker configuration
        {
            connection,
            removeOnComplete: { age: 60, count: 1000 },
            // ⬇️ Keep failed jobs very briefly to avoid Redis pile-up
            removeOnFail: { age: 5 }, // auto-remove failed jobs ~5s after final failure
            concurrency: 50,          // 🚀 Increased from 5 to 50 for production throughput
            lockDuration: 30000,
        }
    );

    worker.on('completed', job => console.log(`✅ Job ${job.id} completed`));
    worker.on('failed', (job, err) => console.error(`❌ Job ${job?.id} failed:`, err.message));
    worker.on('error', err => console.error(`🚨 Worker error:`, err));

    return worker;
}

module.exports = { startTelemetryWorker };
