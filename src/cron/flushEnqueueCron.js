// cron/flushDirectCron.js
const cron = require('node-cron');
const { client: redis } = require('../config/redis/redis');
const { flushTelemetryToMongo } = require('../utils/flushTelemetryToMongo');

// Mongoose models
const EnvTelemetry = require('../models/telemetry/envModel');
const GasSoloTelem = require('../models/telemetry/gasSoloModel');
const AquaTelem = require('../models/telemetry/aquaModel')

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

let isProcessing = false;

async function flushDirectOnce() {
    if (isProcessing) {
        console.log('⏳ Flush cycle already in progress, skipping this run.');
        return;
    }

    let scanned = 0, attempted = 0, success = 0, skipped = 0;
    const BATCH_SIZE = 500; // Process up to 500 devices per cron run

    try {
        isProcessing = true;
        // 🚀 SCALABILITY FIX: SPOP instead of SCAN
        // Get a batch of "dirty" devices that have received data
        let dirtyAuids = await redis.sPop('device:dirty_set', BATCH_SIZE);

        if (!dirtyAuids) return;

        // Ensure we handle both single string (old Redis/client quirk) or array
        if (!Array.isArray(dirtyAuids)) {
            dirtyAuids = [dirtyAuids];
        }

        if (dirtyAuids.length === 0) return;

        console.log(`🧹 Flush cycle start: Checking ${dirtyAuids.length} dirty devices...`);

        // 🚀 SCALABILITY FIX: Parallel Processing with Concurrency Limit
        const CONCURRENCY_LIMIT = 20; // Process 20 devices in parallel

        // Helper to process a single AUID
        const processAuid = async (rawKey) => {
            const auid = String(rawKey).trim();
            if (!auid) return { status: 'skipped' };

            const { modelKey, source } = await resolveModelKey(auid);

            if (!modelKey) {
                console.warn(`⚠️ ${auid}: No metadata/model found. Skipping.`);
                return { status: 'skipped' };
            }

            const mongoModel = MODEL_MAP[modelKey];
            if (!mongoModel) {
                console.warn(`⚠️ ${auid}: model "${modelKey}" unknown. Skipping.`);
                return { status: 'skipped' };
            }

            return await flushTelemetryToMongo(String(auid), mongoModel);
        };

        // Chunking function
        const chunk = (arr, size) => {
            const results = [];
            for (let i = 0; i < arr.length; i += size) {
                results.push(arr.slice(i, i + size));
            }
            return results;
        };

        const chunks = chunk(dirtyAuids, CONCURRENCY_LIMIT);

        for (const batch of chunks) {
            // batch is guaranteed to be an array because dirtyAuids is an array
            const results = await Promise.all(batch.map(processAuid));

            for (const res of results) {
                scanned++;
                attempted++;
                if (res?.status === 'success') success++;
                else if (res?.status === 'skipped') skipped++;
            }
        }

        console.log(`🧹 Flush cycle done: popped=${dirtyAuids.length}, attempted=${attempted}, success=${success}, skipped=${skipped}`);
    } catch (e) {
        console.error('❌ flushDirectOnce error:', e?.message || e, e?.stack);
    } finally {
        isProcessing = false;
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
