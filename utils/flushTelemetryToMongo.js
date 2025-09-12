// utils/flushTelemetryToMongo.js
const { client: redisClient } = require('../config/redis/redis');
// const { connectRedis } = require('../config/redis/redis'); // ✅ Add this line
// const connectDB = require('../config/database/mongodb');

// connectRedis()
// connectDB();

/**
 * Flush unflushed telemetry (f !== 1) for an AUID from Redis -> Mongo,
 * then mark those same Redis hash fields as flushed (f=1).
 *
 * @param {string} auid            Redis hash key (e.g., "GH-...")
 * @param {Mongoose.Model} model   Mongo model (EnvTelemetry, GasSoloTelemetry, ...)
 */
async function flushTelemetryToMongo(auid, model) {
  const LOCK_KEY = `flush_lock_${auid}`;
  const LOCK_EXPIRY = 60; // seconds
  let lockAcquired = false;

  // helper: seconds/ms -> Date
  const toDate = (v) => {
    if (v == null || v === 0) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    const ms = n < 1e12 ? n * 1000 : n; // if seconds, convert to ms
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };

  try {
    // 1) lock
    const ok = await redisClient.set(LOCK_KEY, '1', { NX: true, EX: LOCK_EXPIRY });
    if (!ok) return { status: 'locked', message: `Another flush is in progress for ${auid}` };
    lockAcquired = true;

    // 2) load all
    const all = await redisClient.hGetAll(String(auid));
    if (!all || Object.keys(all).length === 0) {
      return { status: 'empty', message: 'No telemetry hash fields.' };
    }

    // 3) collect unflushed
    const toInsert = [];
    const toMark = []; // [{ ts, doc }]
    for (const [field, raw] of Object.entries(all)) {
      if (field === 'metadata' || field === 'meta') continue; // skip meta fields
      if (!raw) continue;

      let doc;
      try { doc = JSON.parse(raw); } catch { continue; }

      // treat missing "f" as unflushed
      const isFlushed = Number(doc.f ?? 0) === 1;
      if (isFlushed) continue;

      // normalize times (optional; matches mongoose Date types)
      if (doc.transport_time) doc.transport_time = toDate(doc.transport_time);
      if (doc.telem_time)     doc.telem_time     = toDate(doc.telem_time);
      if (doc.ts != null)     doc.ts             = Number(doc.ts);

      if (!doc.auid) doc.auid = auid;

      toInsert.push(doc);
      toMark.push({ ts: field, doc });
    }

    if (toInsert.length === 0) {
      return { status: 'empty', message: 'No unflushed entries.' };
    }

    // 4) threshold (default 1 so it actually flushes)
    const THRESHOLD = parseInt(process.env.BATCH_SIZE || '1', 10);
    if (toInsert.length < THRESHOLD) {
      return { status: 'pending', message: `Only ${toInsert.length} < threshold ${THRESHOLD}` };
    }

    // 5) insert
    await model.insertMany(toInsert, { ordered: false });
    console.log(`✅ Flushed ${toInsert.length} entries for ${auid}`);

    // 6) mark flushed by the SAME hash field (the epoch key)
    for (const { ts, doc } of toMark) {
      const updated = { ...doc, f: 1 };
      await redisClient.hSet(String(auid), String(ts), JSON.stringify(updated));
    }

    return { status: 'success', message: `${toInsert.length} records flushed & flagged.` };
  } catch (err) {
    console.error(`❌ Error flushing ${auid}:`, err?.message || err);
    return { status: 'error', message: err?.message || String(err) };
  } finally {
    if (lockAcquired) {
      try { await redisClient.del(LOCK_KEY); } catch {}
    }
  }
}

module.exports = { flushTelemetryToMongo };
