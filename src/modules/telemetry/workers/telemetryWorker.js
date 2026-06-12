const { Worker } = require('bullmq');
const dotenv = require('dotenv');
const path = require('path');
const { handleEnvQueuedTelemetry } = require("../handlers/handleEnvQueuedTelemetry");
const { handleGasSoloQueuedTelemetry } = require("../handlers/handleSoloGasQueuedTelemetry");
const { handleAquaQueuedTelemetry } = require('../handlers/handleAquaQueuedTelemetry');
const { handleFlowQueuedTelemetry } = require('../handlers/handleFlowQueuedTelemetry');
// 🔒 PRODUCTION HARDENING: Redis client for deduplication
const { client: redisClient } = require('../../../config/redis/redis');
const registerNewDevice = require('../../../models/devices/registerDevice');
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
        keepAlive: 30000,
        maxRetriesPerRequest: null, // REQUIRED for BullMQ workers
    };

    const worker = new Worker(
        'telemetry',
        async job => {
            const data = job.data || {};
            const body = data.body;
            console.log(`📥 [Worker] Received job ${job.id} for transport: ${data.transport || 'unknown'}`);

            // 🔒 Rule: if there's no body, it is NOT telemetry → skip
            if (!body) return;

            // (Optional) light validation; skip if clearly not a datapoint
            if (!body.devid) return;

            const devid = body.devid;
            let devmod = (body.devmod || '').toUpperCase();

            let auid;
            const mapKey = `device:map:${devid}`;
            try {
                auid = await redisClient.get(mapKey);
                if (!auid) {
                    const device = await registerNewDevice.findOne({ devid });
                    if (device) {
                        auid = device.auid;
                        await redisClient.set(mapKey, auid, { EX: 30 * 24 * 60 * 60 }); // 30 days
                    }
                }

                if (!devmod && auid) {
                    const cacheKey = `device:${auid}:meta`;
                    const cachedDataRaw = await redisClient.get(cacheKey);
                    if (cachedDataRaw) {
                        const deviceDoc = JSON.parse(cachedDataRaw);
                        devmod = (deviceDoc.model || '').toUpperCase();
                    } else {
                        const deviceDoc = await registerNewDevice.findOne({ auid });
                        if (deviceDoc) {
                            devmod = (deviceDoc.model || '').toUpperCase();
                            await redisClient.set(cacheKey, JSON.stringify(deviceDoc), { EX: 24 * 60 * 60 });
                        }
                    }
                }
            } catch (err) {
                logger.error(`⚠️ Failed to dynamically resolve devmod for devid ${devid}: %s`, err.message);
            }

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

            if (devmod === 'ENV') {
                console.log('🌿 Processing ENV telemetry');
                await handleEnvQueuedTelemetry(data);
            } else if (devmod === 'AQUA') {
                console.log('🌿 Processing AQUA telemetry');
                await handleAquaQueuedTelemetry(data);
            } else if (devmod === 'GAS-SOLO') {
                console.log('🧪 Processing GAS-SOLO telemetry');
                await handleGasSoloQueuedTelemetry(data);
            } else if (devmod === 'FLOW') {
                console.log(`💧 [${data.transport || 'MQTT'}] Processing FLOW telemetry: ${devid}`);
                await handleFlowQueuedTelemetry(data);
            } else {
                console.log(`⚠️ [Worker] Unknown devmod "${devmod}" for job ${job.id}`);
            }

            console.log(`✅ [Worker] Logic complete for job ${job.id}`);
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

    console.log('✅ Telemetry Worker initialized and listening to "telemetry" queue');

    worker.on('completed', job => console.log(`✅ Job ${job.id} completed`));
    worker.on('failed', (job, err) => console.error(`❌ Job ${job?.id} failed:`, err.message));
    worker.on('error', err => console.error(`🚨 Worker error:`, err));

    return worker;
}

module.exports = { startTelemetryWorker };
