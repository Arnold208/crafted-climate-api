// ✅ Correct: destructure `client` to get the usable Redis instance
const { client: redisClient } = require('../config/redis/redis');

const dotenv = require('dotenv');
const path = require('path');

// const { connectRedis } = require('../config/redis/redis'); // ✅ Add this line
// const connectDB = require('../config/database/mongodb');

// connectRedis()
// connectDB();

// Load correct .env file based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100', 10);

/**
 * Flush telemetry entries for a specific AUID to MongoDB
 * when the batch size threshold is met. Marks each flushed entry with `"f": 1`.
 *
 * @param {String} auid - Redis hash key for the device
 * @param {Mongoose.Model} mongoModel - MongoDB model (e.g., EnvTelemetry)
 */
async function flushTelemetryToMongo(auid, mongoModel) {
  try {
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

        // ✅ Only flush if it's not already flushed
        if (parsed.f === 0) {
          datapoints.push(parsed);
          flushedTimestamps.push(key); // key is timestamp string
        }
      } catch (err) {
        console.warn(`⚠️ Skipping invalid telemetry at ${key} for ${auid}: ${err.message}`);
      }
    }

    if (datapoints.length < BATCH_SIZE) {
      return {
        status: "pending",
        message: `Only ${datapoints.length}/${BATCH_SIZE} unflushed entries available. Threshold not reached.`,
      };
    }

    // ✅ Insert to MongoDB
    await mongoModel.insertMany(datapoints);
    console.log(`✅ Flushed ${datapoints.length} telemetry entries for ${auid} to MongoDB.`);

    // ✅ Update Redis: set `"f": 1` for flushed entries
    for (const ts of flushedTimestamps) {
      const updated = { ...datapoints.find(d => d.date.toString() === ts), f: 1 };
      await redisClient.hSet(auid, ts, JSON.stringify(updated));
    }

    return {
      status: "success",
      message: `${datapoints.length} telemetry records flushed and marked as flushed.`,
    };

  } catch (err) {
    console.error(` Error flushing telemetry for ${auid}:`, err.message);
    return { status: "error", message: err.message };
  }
}

module.exports = { flushTelemetryToMongo };
