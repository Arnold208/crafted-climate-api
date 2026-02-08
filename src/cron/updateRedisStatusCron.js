const cron = require('node-cron');
const { client: redis } = require('../config/redis/redis');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStatusFromTimestamp(ts, thresholdMin = 30) {
  if (!ts) return 'offline';
  const diff = (Date.now() - ts) / 60000; // ms → minutes
  return diff <= thresholdMin ? 'online' : 'offline';
}

// ---------------------------------------------------------------------------
// MAIN JOB (Optimized ZSET Approach)
// ---------------------------------------------------------------------------

async function updateRedisDeviceStatusesOnce() {
  const thresholdMin = Number(process.env.DEVICE_STATUS_THRESHOLD_MINUTES || 30);
  const now = Date.now();
  const onlineCutoff = now - (thresholdMin * 60 * 1000);

  let scanned = 0;
  let changed = 0;

  try {
    // 1. Get ALL devices from the heartbeat ZSET (Efficient Source of Truth)
    // Range: 0 to +inf (all devices ever seen)
    const allDevices = await redis.zRangeWithScores('devices:heartbeat', 0, -1);

    if (!allDevices || allDevices.length === 0) {
      console.log('⚠️ No devices found in devices:heartbeat ZSET.');
      return;
    }

    scanned = allDevices.length;

    // 2. Process each device
    for (const { value: auid, score } of allDevices) {
      // Score in ZSET is the last timestamp (ms)
      const lastSeen = score;

      // Determine new status
      const newStatus = lastSeen >= onlineCutoff ? 'online' : 'offline';

      // 3. Fetch current metadata to see if update is needed
      const metaStr = await redis.hGet(auid, 'metadata');
      if (!metaStr) continue; // Device data missing/expired

      let meta;
      try {
        meta = JSON.parse(metaStr);
      } catch (e) {
        continue;
      }

      // 4. Update ONLY if status changed
      if (meta.status !== newStatus) {
        const oldStatus = meta.status;
        meta.status = newStatus;
        meta.statusUpdatedAt = new Date().toISOString();

        await redis.hSet(auid, 'metadata', JSON.stringify(meta));
        changed++;
        console.log(`🔄 ${auid} status changed: ${oldStatus} → ${newStatus}`);
      }
    }

    console.log(`📊 Status Cron Completed: scanned=${scanned}, changed=${changed}`);

  } catch (err) {
    console.error('❌ Error executing status update cron:', err.message);
  }
}

// ---------------------------------------------------------------------------
// CRON SCHEDULER
// ---------------------------------------------------------------------------

function startUpdateRedisStatusCron() {
  const schedule = process.env.DEVICE_STATUS_CRON || '* * * * *'; // every 1 min
  cron.schedule(schedule, updateRedisDeviceStatusesOnce, {
    timezone: 'Africa/Accra',
  });
  console.log('⏱️ Redis device status cron scheduled:', schedule);
}

module.exports = {
  startUpdateRedisStatusCron,
  updateRedisDeviceStatusesOnce
};
