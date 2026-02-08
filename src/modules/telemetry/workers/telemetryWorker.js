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
            // FIX: Use 'event' UUID from Notecard/Hub if available to safely handle batches with same timestamp
            // Fallback to timestamp if event ID is missing
            const eventId = data.event || body.event;
            const timestamp = body.ts || body.time || data.receivedAt || Date.now(); // Also check body.time

            let dedupKey;
            if (eventId) {
                dedupKey = `seen:event:${eventId}`;
            } else {
                dedupKey = `seen:${devid}:${timestamp}`;
            }

            try {
                // NX flag: only set if key doesn't exist (returns null if already exists)
                const isNew = await redisClient.set(dedupKey, '1', {
                    EX: 300,  // Expire after 5 minutes
                    NX: true  // Only set if not exists
                });

                if (!isNew) {
                    console.log(`⏭️ [DEBUG] Skipping duplicate telemetry: ${dedupKey}`); // Forced Log
                    logger.debug(`⏭️ Skipping duplicate telemetry: ${dedupKey}`);
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
            // ⬇️ HARDENING: Keep failed jobs for 24 hours for debugging/replay (DLQ)
            removeOnFail: { age: 24 * 3600 }, // 24 hours
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
