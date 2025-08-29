const { client: redisClient } = require('../config/redis/redis');

/**
 * Flush telemetry entries for a specific AUID to MongoDB
 * when the batch size threshold is met. Marks each flushed entry with `"f": 1`.
 *
 * @param {String} auid - Redis hash key for the device
 * @param {Mongoose.Model} mongoModel - MongoDB model (e.g., EnvTelemetry)
 */
async function flushTelemetryToMongo(auid, mongoModel) {
  const LOCK_KEY = `flush_lock_${auid}`;
  const LOCK_EXPIRY = 60; // seconds

  try {
    // Acquire lock to prevent race conditions
    const lock = await redisClient.set(LOCK_KEY, '1', {
      NX: true,
      EX: LOCK_EXPIRY,
    });

    if (!lock) {
      return { status: "locked", message: `Another flush is in progress for ${auid}` };
    }

    const entries = await redisClient.hGetAll(auid);
    if (!entries || Object.keys(entries).length <= 2) {
      return { status: "empty", message: "No telemetry data to flush." };
    }

    const datapoints = [];
    const flushedTimestamps = [];

    for (const [key, value] of Object.entries(entries)) {
      if (key === "metadata" || key === "flushed") continue;

      try {
        const parsed = JSON.parse(value);

        if (parsed.f === 0) {
          datapoints.push(parsed);
          flushedTimestamps.push(key); // key is timestamp string
        }
      } catch (err) {
        console.warn(`⚠️ Skipping invalid telemetry at ${key} for ${auid}: ${err.message}`);
      }
    }

    if (datapoints.length < parseInt(process.env.BATCH_SIZE || '100', 10)) {
      return {
        status: "pending",
        message: `Only ${datapoints.length} unflushed entries available. Threshold not reached.`,
      };
    }

    // Insert into MongoDB with unordered option to avoid failure on single bad doc
    await mongoModel.insertMany(datapoints, { ordered: false });
    console.log(`✅ Flushed ${datapoints.length} telemetry entries for ${auid} to MongoDB.`);

    // Update Redis entries: mark as flushed
    for (const ts of flushedTimestamps) {
      const original = datapoints.find(d => d.date && d.date.toString() === ts);
      if (original) {
        const updated = { ...original, f: 1 };
        await redisClient.hSet(auid, ts, JSON.stringify(updated));
      }
    }

    return {
      status: "success",
      message: `${datapoints.length} telemetry records flushed and marked as flushed.`,
    };

  } catch (err) {
    console.error(`❌ Error flushing telemetry for ${auid}:`, err.message);
    return { status: "error", message: err.message };
  } finally {
    // Release lock
    await redisClient.del(`flush_lock_${auid}`);
  }
}

module.exports = { flushTelemetryToMongo };
