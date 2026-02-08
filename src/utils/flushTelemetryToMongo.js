// utils/flushTelemetryToMongo.js
const { client: redisClient } = require('../config/redis/redis');
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

      // CLONE for MongoDB modification (to keep original `doc` intact for Redis update)
      const mongoDoc = { ...doc };

      // normalize times for MONGO only
      if (mongoDoc.transport_time) mongoDoc.transport_time = toDate(mongoDoc.transport_time);
      if (mongoDoc.telem_time) mongoDoc.telem_time = toDate(mongoDoc.telem_time);
      if (mongoDoc.ts != null) mongoDoc.ts = Number(mongoDoc.ts);

      if (!mongoDoc.auid) mongoDoc.auid = auid;

      toInsert.push(mongoDoc);
      toMark.push({ ts: field, doc }); // Pass original `doc` to be re-saved to Redis
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
    // 6) mark flushed by the SAME hash field (the epoch key)
    const batchUpdates = {};
    for (const { ts, doc } of toMark) {
      const updated = { ...doc, f: 1 };
      batchUpdates[String(ts)] = JSON.stringify(updated);
    }

    if (Object.keys(batchUpdates).length > 0) {
      // 🚀 SCALABILITY FIX: Single round-trip to Redis instead of N awaits
      // hSet supports multiple field-value pairs: hSet(key, { field: value, ... })
      await redisClient.hSet(String(auid), batchUpdates);
    }

    return { status: 'success', message: `${toInsert.length} records flushed & flagged.` };
  } catch (err) {
    console.error(`❌ Error flushing ${auid}:`, err?.message || err);
    return { status: 'error', message: err?.message || String(err) };
  } finally {
    if (lockAcquired) {
      try { await redisClient.del(LOCK_KEY); } catch { }
    }
  }
}

module.exports = { flushTelemetryToMongo };
