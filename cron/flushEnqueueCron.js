// cron/flushDirectCron.js
const cron = require('node-cron');
const { client: redis } = require('../config/redis/redis');
const { flushTelemetryToMongo } = require('../utils/flushTelemetryToMongo');

// Mongoose models
const EnvTelemetry = require('../model/telemetry/envModel');
const GasSoloTelem = require('../model/telemetry/gasSoloModel');

/** Map metadata.model -> Mongo model (lowercase keys) */
const MODEL_MAP = {
    'env': EnvTelemetry,
    'gas-solo': GasSoloTelem,
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

/** SCAN helper with wide client compatibility */
async function* scanKeys(match, count = 1000) {
    const MATCH = String(match);
    const COUNT_NUM = Number(count) || 1000;
    const COUNT_STR = String(COUNT_NUM);

    if (typeof redis.scanIterator === 'function') {
        for await (const key of redis.scanIterator({ MATCH, COUNT: COUNT_NUM })) yield String(key);
        return;
    }

    if (typeof redis.scan === 'function' && redis.scan.length === 2) {
        let cursor = '0';
        while (true) {
            const res = await redis.scan(cursor, { MATCH: MATCH, COUNT: COUNT_NUM });
            const next = Array.isArray(res) ? res[0] : (res && res.cursor) || '0';
            const keys = Array.isArray(res) ? res[1] : (res && res.keys) || [];
            for (const k of keys) yield String(k);
            cursor = String(next ?? '0');
            if (cursor === '0') break;
        }
        return;
    }

    if (typeof redis.scanStream === 'function') {
        const stream = redis.scanStream({ match: MATCH, count: COUNT_NUM });
        const queue = [];
        let ended = false;

        stream.on('data', keys => queue.push(...keys));
        stream.on('end', () => { ended = true; });
        stream.on('error', err => { console.error('[scanner] scanStream error:', err?.message); ended = true; });

        while (!ended || queue.length) {
            while (queue.length) yield String(queue.shift());
            if (!ended) await new Promise(r => setTimeout(r, 5));
        }
        return;
    }

    if (typeof redis.scan === 'function') {
        let cursor = '0';
        while (true) {
            const res = await redis.scan(String(cursor), 'MATCH', MATCH, 'COUNT', COUNT_STR);
            const next = Array.isArray(res) ? res[0] : (res && res.cursor) || '0';
            const keys = Array.isArray(res) ? res[1] : (res && res.keys) || [];
            for (const k of keys) yield String(k);
            cursor = String(next ?? '0');
            if (cursor === '0') break;
        }
        return;
    }

    if (typeof redis.keys !== 'function') throw new Error('No SCAN/KEYS available on redis client');
    const keys = await redis.keys(MATCH);
    for (const k of keys) yield String(k);
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

    try {
        for await (const rawKey of scanKeys('GH-*', 1000)) {
            // Some environments are producing a comma-joined list in a single key string.
            // Normalize to individual AUIDs.
            const auids = String(rawKey).split(',').map(s => s.trim()).filter(Boolean);

            for (const auid of auids) {
                scanned++;

                const { modelKey, source } = await resolveModelKey(auid);
                console.log(`🔎 AUID=${auid} → modelKey=${modelKey || 'N/A'} (source=${source})`);

                if (!modelKey) { skipped++; continue; }

                const mongoModel = MODEL_MAP[modelKey];
                if (!mongoModel) {
                    console.warn(`⚠️ ${auid}: model "${modelKey}" not in MODEL_MAP, skipping`);
                    skipped++;
                    continue;
                }

                attempted++;
                const res = await flushTelemetryToMongo(String(auid), mongoModel);
                if (res?.status === 'success') success++;
                else console.warn(`↪️ ${auid} flush result:`, res);
            }
        }

        console.log(`🧹 Flush cycle: scanned=${scanned}, attempted=${attempted}, success=${success}, skipped=${skipped}`);
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
