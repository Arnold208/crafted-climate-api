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

// ============================================================
// MRV ENGINE: Canonical envelope + evidence queue
// Loaded lazily so MRV workers don't block startup if unavailable
// ============================================================
let mrvEvidenceQueue;
let buildCanonicalEnvelope;
let SensorInstallation; // loaded lazily to avoid circular deps
try {
    ({ mrvEvidenceQueue } = require('../../../workers/mrv/queues'));
    ({ buildCanonicalEnvelope } = require('../evidence/envelope'));
    SensorInstallation = require('../../../models/mrv/evidence/SensorInstallation.model');
} catch (e) {
    // MRV module not yet loaded — operational path continues normally
    logger.warn('[TelemetryWorker] MRV modules not loaded yet:', e.message);
}

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

            // MRV FIX: If devid is missing, quarantine the event rather than silent drop
            if (!body.devid) {
                logger.warn(`[TelemetryWorker] Event ${job.id} has no devid — event quarantined (unresolved)`);
                // Attempt MRV unresolved receipt if MRV path is active
                if (mrvEvidenceQueue && buildCanonicalEnvelope) {
                    try {
                        const envelope = buildCanonicalEnvelope({ rawEvent: data.body || data, devid: null, transport: data.transport || 'notehub-mqtt', sourceEventId: data.event || null });
                        envelope.quarantineReason = 'MISSING_DEVID';
                        await mrvEvidenceQueue.add('evidence', envelope, { jobId: `unresolved-${envelope.ingestionId}`, attempts: 2, backoff: { type: 'fixed', delay: 5000 } });
                    } catch (mrvErr) {
                        logger.error('[TelemetryWorker] Failed to quarantine unresolved event:', mrvErr.message);
                    }
                }
                return;
            }

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

            // ── MRV: Resolve projectIds from active SensorInstallations ──────────
            // Cached in Redis (1h TTL) so MongoDB is not hit on every reading.
            // Fails silently — never blocks the operational telemetry path.
            let mrvProjectIds = [];
            let mrvOrgId      = null;
            if (auid && SensorInstallation) {
                try {
                    const mrvCacheKey = `device:${auid}:mrv_projects`;
                    const mrvCached   = await redisClient.get(mrvCacheKey);
                    if (mrvCached) {
                        const parsed  = JSON.parse(mrvCached);
                        mrvProjectIds = parsed.projectIds    || [];
                        mrvOrgId      = parsed.organizationId || null;
                    } else {
                        const installs = await SensorInstallation.find(
                            { auid, status: { $in: ['ACTIVE', 'MAINTENANCE'] } },
                            { projectId: 1, organizationId: 1, _id: 0 }
                        ).lean();
                        mrvProjectIds = installs.map(i => i.projectId).filter(Boolean);
                        mrvOrgId      = installs[0]?.organizationId || null;
                        // Cache for 1 hour — invalidated automatically on TTL expiry
                        await redisClient.set(mrvCacheKey,
                            JSON.stringify({ projectIds: mrvProjectIds, organizationId: mrvOrgId }),
                            { EX: 3600 }
                        );
                        if (mrvProjectIds.length > 0) {
                            logger.info(`[TelemetryWorker] Device ${auid} linked to MRV project(s): ${mrvProjectIds.join(', ')}`);
                        }
                    }
                } catch (mrvInstErr) {
                    logger.warn(`[TelemetryWorker] Could not resolve MRV project IDs for ${auid}: ${mrvInstErr.message}`);
                }
            }

            // 🔒 PRODUCTION HARDENING: Idempotency/Deduplication Check
            // FIX: Use 'event' UUID from Notecard/Hub if available to safely handle batches with same timestamp
            // Fallback to timestamp if event ID is missing
            const eventId = data.event || body.event;
            // MRV FIX: Keep null instead of fabricating Date.now() as measurement time
            const observedAt = body.ts || body.time || null;
            const timestamp = body.ts || body.time || data.receivedAt || Date.now();

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

            // ============================================================
            // MRV ENGINE: Build canonical envelope and enqueue evidence job
            // This runs BEFORE operational normalization (preserves raw event)
            // Only for devices that are registered (auid resolved)
            // ============================================================
            if (mrvEvidenceQueue && buildCanonicalEnvelope && auid) {
                try {
                    const envelope = buildCanonicalEnvelope({
                        rawEvent: body,
                        devid, auid, model: devmod,
                        transport: data.transport || 'notehub-mqtt',
                        sourceTopic: data.topic || null,
                        sourceEventId: eventId || null,
                        observedAt: observedAt ? (observedAt < 1e12 ? new Date(observedAt * 1000).toISOString() : new Date(observedAt).toISOString()) : null,
                        sequenceNumber: body.seq || null,
                        firmwareVersion: body.body?.version || body.version || null,
                        // ── MRV project linkage (resolved above from active SensorInstallations)
                        organizationId: mrvOrgId,
                        projectIds:     mrvProjectIds
                    });
                    // Use sourceEventId as jobId for idempotency across restarts
                    const mrvJobId = eventId ? `mrv-${eventId}` : `mrv-${envelope.ingestionId}`;
                    await mrvEvidenceQueue.add('evidence', envelope, {
                        jobId: mrvJobId,
                        attempts: 3,
                        backoff: { type: 'exponential', delay: 2000 }
                    });
                } catch (mrvErr) {
                    // MRV path failure must NOT block operational path
                    logger.error(`[TelemetryWorker] MRV evidence queue error for ${devid}: ${mrvErr.message}`);
                }
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
