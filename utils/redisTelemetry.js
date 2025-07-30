const { client: redisClient } = require('../config/redis/redis');

/**
 * Caches telemetry data and device metadata in Redis under the AUID hash.
 * Marks each telemetry entry as unflushed ("f": 0).
 *
 * @param {string} auid - The device's unique ID.
 * @param {object} telemetry - The mapped telemetry payload.
 * @param {object} device - The full device object from MongoDB.
 */
async function cacheTelemetryToRedis(auid, telemetry, device) {
  let timestamp;

  if (telemetry?.date) {
    timestamp = telemetry.date;
  } else if (telemetry?.transport_time) {
    timestamp = telemetry.transport_time;
  } else {
    console.log("no date found")// fallback to current time
  }
  

  const redisHashKey = auid;

  // ✅ Build metadata
  const metadata = {
    auid: device.auid,
    nickname: device.nickname,
    availability: device.availability,
    status: device.status,
    battery: device.battery,
    location: device.location,
    model: device.model,
    type: device.type,
    serial: device.serial,
    mac: device.mac,
    collaborators: device.collaborators,
  };

  // ✅ Store metadata
  await redisClient.hSet(redisHashKey, 'metadata', JSON.stringify(metadata));

  // ✅ Add flush flag to telemetry
  const telemetryWithFlag = { ...telemetry, f: 0 };

  // ✅ Cache telemetry
  await redisClient.hSet(redisHashKey, timestamp.toString(), JSON.stringify(telemetryWithFlag));

  // ✅ Expire the device’s Redis key after 24 hours
  await redisClient.expire(redisHashKey, 86400);

  console.log(`📦 Cached telemetry for ${auid} at ${timestamp} [unflushed]`);
}

module.exports = { cacheTelemetryToRedis };
