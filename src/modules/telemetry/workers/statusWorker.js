const { Worker } = require('bullmq');
const dotenv = require('dotenv');
const path = require('path');

// Reuse your already-connected Redis client (node-redis v4 or ioredis w/ similar API)
const { client: redisClient } = require('../../../config/redis/redis');
// Read-only registration check
const registerNewDevice = require('../../../models/devices/registerDevice');
// Device event log (fire-and-forget)
const eventLog = require('../../devices/eventLog/eventLog.service');

function startStatusWorker() {
    let envFile;

    if (process.env.NODE_ENV === 'development') {
        envFile = '.env.development';
    } else {
        envFile = '.env';   // default for production or if NODE_ENV not set
    }

    // Adjusted path: src/modules/telemetry/workers -> root (depth 4)
    dotenv.config({ path: path.resolve(__dirname, `../../../../${envFile}`) });
    // BullMQ connection
    const connection = {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        keepAlive: 30000,
        maxRetriesPerRequest: null, // REQUIRED for BullMQ workers
    };

    // TTLs
    const PRESENCE_TTL_SECONDS = parseInt(
        process.env.DEVICE_PRESENCE_TTL_SECONDS || process.env.DEVICE_STATUS_TTL_SECONDS || '180',
        10
    );
    const LASTSEEN_TTL_SECONDS = parseInt(
        process.env.DEVICE_LASTSEEN_TTL_SECONDS || String(24 * 60 * 60),
        10
    );

    // Keys
    const kPresence = (id) => `device:presence:${id}`;
    const kLastSeen = (id) => `device:lastseen:${id}`;
    const kState = (id) => `device:state:${id}`;
    const kAllSet = 'devices:all';

    // node-redis v4 vs ioredis shim
    const sAdd = (...args) => (typeof redisClient.sAdd === 'function'
        ? redisClient.sAdd(...args)
        : redisClient.sadd(...args));

    const worker = new Worker(
        'status',
        async (job) => {
            // Disable retries for status pings (idempotent)
            // job.discard();
            // ↑ Legacy behavior disabled: we now allow up to 2 retries per global policy.

            // 0) Extract devid (body-only per your rule, with a fallback if you ever change producers)
            const devid =
                job?.data?.body?.devid ??
                job?.data?.devid ??
                job?.data?.deviceId ??
                job?.data?.body?.deviceId;

            console.log(`📥 [StatusWorker] Received job ${job.id} for devid: ${devid}`);

            if (!devid) {
                // Ignore silently; DO NOT job.remove() here
                return;
            }

            const presenceKey = kPresence(devid);
            const lastSeenKey = kLastSeen(devid);
            const stateKey = kState(devid);
            const nowIso = new Date().toISOString();

            // 1) ATOMIC CACHE REFRESH
            const tx = redisClient.multi();
            tx.set(presenceKey, '1', { EX: PRESENCE_TTL_SECONDS });
            tx.set(lastSeenKey, nowIso, { EX: LASTSEEN_TTL_SECONDS });
            tx.set(stateKey, 'online', { EX: LASTSEEN_TTL_SECONDS });

            // 2) IDENTIFICATION & PREFERENCES CACHE
            // devid -> auid mapping (long lived)
            const mapKey = `device:map:${devid}`;
            let auid = await redisClient.get(mapKey);

            if (!auid) {
                const device = await registerNewDevice.findOne({ devid });
                if (!device) return; // Unregistered
                auid = device.auid;
                await redisClient.set(mapKey, auid, { EX: 30 * 24 * 60 * 60 }); // 30 days
            }

            // Metadata cache (prefs, nickname, location) - keyed by AUID
            const cacheKey = `device:${auid}:meta`;
            const cachedDataRaw = await redisClient.get(cacheKey);
            let prefs;
            let deviceDoc;

            if (cachedDataRaw) {
                deviceDoc = JSON.parse(cachedDataRaw);
                prefs = deviceDoc.notificationPreferences;
                // Refresh cache TTL
                tx.expire(cacheKey, 24 * 60 * 60); // 24h
            } else {
                deviceDoc = await registerNewDevice.findOne({ auid }); // Secondary fetch if map exists but cache expired
                if (!deviceDoc) return;

                prefs = deviceDoc.notificationPreferences;
                tx.set(cacheKey, JSON.stringify(deviceDoc), { EX: 24 * 60 * 60 });
            }

            const deviceState = deviceDoc.state || 'active';
            if (deviceState === 'inactive' || deviceState === 'disabled') {
                console.log(`[StatusWorker] Ignoring heartbeat for ${auid}; device state is ${deviceState}.`);
                tx.del(presenceKey);
                tx.set(stateKey, deviceState, { EX: LASTSEEN_TTL_SECONDS });
                if (typeof tx.zRem === 'function') {
                    tx.zRem('devices:heartbeat', auid);
                } else if (typeof tx.zrem === 'function') {
                    tx.zrem('devices:heartbeat', auid);
                }
                await tx.exec();
                return;
            }

            // 3) HEARTBEAT UPDATE (ZSET)
            // Use AUID as member for direct dashboard compatibility
            if (typeof tx.zAdd === 'function') {
                tx.zAdd('devices:heartbeat', { score: Date.now(), value: auid });
            } else if (typeof tx.zadd === 'function') {
                tx.zadd('devices:heartbeat', Date.now(), auid);
            }

            // Compatibility for other systems using devid
            if (typeof tx.sAdd === 'function') tx.sAdd(kAllSet, devid);
            else if (typeof tx.sadd === 'function') tx.sadd(kAllSet, devid);

            // Check previous status in Redis to see if we transition to online
            const prevMetaStr = await redisClient.hGet(auid, 'metadata');
            let prevStatus = 'unknown';
            let metaObj = null;
            if (prevMetaStr) {
                try {
                    metaObj = JSON.parse(prevMetaStr);
                    prevStatus = metaObj.status;
                } catch (e) {}
            }

            if (prevStatus !== 'online') {
                try {
                    await registerNewDevice.updateOne(
                        { auid },
                        { $set: { status: 'online', lastSeen: new Date() } }
                    );
                } catch (err) {
                    console.error(`❌ [StatusWorker] Failed to sync online status for ${auid}:`, err.message);
                }

                if (metaObj) {
                    metaObj.status = 'online';
                    metaObj.statusUpdatedAt = new Date().toISOString();
                    tx.hSet(auid, 'metadata', JSON.stringify(metaObj));
                }

                tx.publish('device:status-change', JSON.stringify({ auid, status: 'online' }));

                // 📋 EVENT LOG — device came back online
                const wasOffline = prevStatus === 'offline';
                eventLog.online({
                    auid,
                    devid,
                    userId: deviceDoc?.userid || deviceDoc?.userId,
                    orgId:  deviceDoc?.organizationId,
                    metadata: { prevStatus, recoveredAt: nowIso },
                }).catch(() => {});

                // Clear consecutive partials counter on recovery
                redisClient.del(`device:${auid}:consecutive_partials`).catch(() => {});
            }

            // 4) CLEAR ALERT STATE & ESCALATION CONTEXT
            tx.del(`device:${auid}:alert_context`);
            tx.del(`device:${auid}:alert_state`);

            await tx.exec();
            console.log(`✅ [StatusWorker] Status update complete for job ${job.id}`);
            return;
        },
        //1
        {
            connection,
            removeOnComplete: { age: 60, count: 1000 },
            removeOnFail: { age: 5 }, // remove failed jobs ~5s after final failure
            // Optional tuning to reduce lock churn:
            // concurrency: 10,
            // lockDuration: 30000,
        }
    );

    console.log('✅ Status Worker initialized and listening to "status" queue');

    const logger = require('../../../utils/logger');

    worker.on('completed', (job) => logger.debug(`✅ Status Job ${job.id} completed`));
    worker.on('failed', async (job, err) => {
        logger.error(`❌ Status Job ${job?.id} failed: %s`, err?.stack || err);

        // Belt-and-suspenders cleanup in case removeOnFail isn't honored in some edge case.
        try {
            if (job && job.opts && typeof job.attemptsMade === 'number') {
                const maxAttempts = job.opts.attempts ?? 0;
                if (job.attemptsMade >= maxAttempts) {
                    setTimeout(async () => {
                        try {
                            const fresh = await job.queue.getJob(job.id);
                            if (fresh) {
                                await fresh.remove();
                                logger.info(`🧹 Removed terminally failed status job ${job.id}`);
                            }
                        } catch (_) { }
                    }, 5000);
                }
            }
        } catch (_) { }
    });
    worker.on('error', (err) => logger.error('🚨 Status Worker error: %o', err));

    return worker;
}

module.exports = { startStatusWorker };
