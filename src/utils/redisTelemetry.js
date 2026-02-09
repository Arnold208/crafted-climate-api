const { client: redisClient } = require('../config/redis/redis');
const RegisterDevice = require('../models/devices/registerDevice');

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

  if (telemetry?.timestamp) {
    timestamp = telemetry.timestamp;
  } else if (telemetry?.date) {
    timestamp = telemetry.date;
  } else if (telemetry?.transport_time) {
    timestamp = telemetry.transport_time;
  } else {
    timestamp = Date.now(); // fallback to current time
    console.log("⚠️ No date/timestamp found in telemetry, using Date.now()");
  }

  const redisHashKey = auid;

  // ⚡ INSTANT STATUS SYNC (Offline -> Online)
  // Check previous status in Redis to avoid spamming MongoDB on every packet
  const prevMetaStr = await redisClient.hGet(redisHashKey, 'metadata');
  let prevStatus = 'unknown';
  if (prevMetaStr) {
    try {
      const prevMeta = JSON.parse(prevMetaStr);
      prevStatus = prevMeta.status;
    } catch (e) { }
  }

  // If device was offline (or unknown), sync "Online" to MongoDB immediately
  if (prevStatus !== 'online') {
    try {
      await RegisterDevice.updateOne(
        { auid },
        { $set: { status: 'online', lastSeen: new Date(timestamp) } }
      );
      console.log(`🔄 [RedisTelemetry] Synced ${auid} to ONLINE in MongoDB`);
    } catch (err) {
      console.error(`❌ Failed to sync status for ${auid}:`, err.message);
    }
  }

  // ✅ Build metadata
  const metadata = {
    auid: device.auid,
    nickname: device.nickname,
    availability: device.availability,
    status: 'online', // ⚡ FORCE ONLINE INSTANTLY (Data just arrived!)
    battery: device.battery,
    location: device.location,
    model: device.model,
    type: device.type,
    serial: device.serial,
    mac: device.mac,
    collaborators: device.collaborators,
    statusUpdatedAt: new Date().toISOString() // Track when it flipped
  };

  // ✅ Store metadata
  await redisClient.hSet(redisHashKey, 'metadata', JSON.stringify(metadata));

  // ✅ Add flush flag to telemetry
  const telemetryWithFlag = { ...telemetry, f: 0 };

  // ✅ Cache telemetry
  await redisClient.hSet(redisHashKey, timestamp.toString(), JSON.stringify(telemetryWithFlag));

  // ✅ Add to Dirty Set for the Flush Cron to pick up
  await redisClient.sAdd('device:dirty_set', auid);

  // ✅ UPDATE STATUS TRACKER (ZSET)
  // This is critical for the "Online/Offline" cron job.
  // We use the timestamp as the score.
  await redisClient.zAdd('devices:heartbeat', {
    score: timestamp,
    value: auid
  });

  // ✅ RE-ARM ALERTS
  // If device was offline and alerted, clear the flag so we can alert again if it drops.
  // We clear the entire context/levels to reset the escalation ladder.
  await redisClient.del(`device:${auid}:alert_context`);
  await redisClient.del(`device:${auid}:alert_state`); // Clear legacy key just in case

  // ✅ Expire the device’s Redis key after 24 hours
  await redisClient.expire(redisHashKey, 86400);

  console.log(`📦 Cached telemetry for ${auid} at ${timestamp} [unflushed]`);
}

module.exports = { cacheTelemetryToRedis };
