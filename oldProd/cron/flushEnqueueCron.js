// cron/flushDirectCron.js
const cron = require('node-cron');
const { client: redis } = require('../config/redis/redis');
const { flushTelemetryToMongo } = require('../utils/flushTelemetryToMongo');

// Mongoose models
const EnvTelemetry = require('../model/telemetry/envModel');
const GasSoloTelem = require('../model/telemetry/gasSoloModel');
const AquaTelem = require('../model/telemetry/aquaModel')

/** Map metadata.model -> Mongo model (lowercase keys) */
const MODEL_MAP = {
    'env': EnvTelemetry,
    'gas-solo': GasSoloTelem,
    'aqua': AquaTelem
};

/* -------------------- helpers -------------------- */
const safeJson = (s) => {
    try { return typeof s === 'string' ? JSON.parse(s) : null; }
    catch { return null; }
};

async function hgetallSafe(key) {
    const k = String(key);
    if (typeof redis.hGetAll === 'function') return redis.hGetAll(k); // node-redis v4
    if (typeof redis.hgetall === 'function') return redis.hgetall(k); // ioredis
    throw new Error('Redis client has neither hGetAll nor hgetall');
}


/** Always resolve from metadata.model (using hGetAll like your route) */
async function resolveModelKey(auid) {
    const entries = await hgetallSafe(auid);
    if (!entries || !entries.metadata) return { modelKey: null, source: 'none' };

    const meta = safeJson(entries.metadata);
    if (!meta || !meta.model) return { modelKey: null, source: 'none' };

    return { modelKey: String(meta.model).trim().toLowerCase(), source: 'metadata' };
}

/* -------------------- one flush cycle -------------------- */
async function flushDirectOnce() {
    let scanned = 0, attempted = 0, success = 0, skipped = 0;
    const BATCH_SIZE = 500; // Process up to 500 devices per cron run

    try {
        // 🚀 SCALABILITY FIX: SPOP instead of SCAN
        // Get a batch of "dirty" devices that have received data
        const dirtyAuids = await redis.sPop('device:dirty_set', BATCH_SIZE);

        if (!dirtyAuids || dirtyAuids.length === 0) {
            // No dirty devices? Do nothing.
            return;
        }

        console.log(`🧹 Flush cycle start: Checking ${dirtyAuids.length} dirty devices...`);

        for (const rawKey of dirtyAuids) {
            const auid = String(rawKey).trim();
            if (!auid) continue;

            scanned++;

            const { modelKey, source } = await resolveModelKey(auid);
            // console.log(`🔎 AUID=${auid} → modelKey=${modelKey || 'N/A'} (source=${source})`);

            if (!modelKey) {
                console.warn(`⚠️ ${auid}: No metadata/model found. Re-queueing logic needed if strict persistence required.`);
                skipped++;
                continue;
            }

            const mongoModel = MODEL_MAP[modelKey];
            if (!mongoModel) {
                console.warn(`⚠️ ${auid}: model "${modelKey}" not in MODEL_MAP, skipping. (Available: ${Object.keys(MODEL_MAP).join(', ')})`);
                skipped++;
                continue;
            }

            attempted++;
            const res = await flushTelemetryToMongo(String(auid), mongoModel);

            if (res?.status === 'success') {
                success++;
            } else {
                console.warn(`↪️ ${auid} flush result:`, res);
                // Optional: If flush specifically failed due to DB error (not just "empty"), 
                // we might want to SADD it back. 
                // However, "empty" or "locked" or "pending" are fine to drop from dirty set 
                // until next telemetry packet comes in.
            }
        }

        console.log(`🧹 Flush cycle done: popped=${dirtyAuids.length}, attempted=${attempted}, success=${success}, skipped=${skipped}`);
    } catch (e) {
        console.error('❌ flushDirectOnce error:', e?.message || e, e?.stack);
    }
}

/* -------------------- scheduler -------------------- */
function startFlushDirectCron() {
    const schedule = process.env.CRON_SCHEDULE || '0 * * * *';

    cron.schedule(schedule, async () => {
        await flushDirectOnce();
    }, { timezone: process.env.TZ || 'Africa/Accra' });

    console.log('⏱️ Direct flush cron scheduled');
}

module.exports = { startFlushDirectCron, flushDirectOnce };
