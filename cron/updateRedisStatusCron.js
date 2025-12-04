const cron = require('node-cron');
const { client: redis } = require('../config/redis/redis');

const safeJson = (s) => {
  try { return typeof s === 'string' ? JSON.parse(s) : null; }
  catch { return null; }
};

async function hgetallSafe(key) {
  if (typeof redis.hGetAll === 'function') return redis.hGetAll(key);
  if (typeof redis.hgetall === 'function') return redis.hgetall(key);
  return null;
}

async function* scanKeys(match = 'GH-*', count = 1000) {
  if (typeof redis.scanIterator === 'function') {
    for await (const key of redis.scanIterator({ MATCH: match, COUNT: count })) yield key;
  } else {
    let cursor = '0';
    do {
      const res = await redis.scan(cursor, 'MATCH', match, 'COUNT', count);
      cursor = res[0];
      for (const key of res[1]) yield key;
    } while (cursor !== '0');
  }
}

function getStatusFromTimestamp(ts, thresholdMin = 15) {
  if (!ts) return 'offline';
  const diff = (Date.now() - new Date(ts).getTime()) / 60000;
  return diff <= thresholdMin ? 'online' : 'offline';
}

async function updateRedisDeviceStatusesOnce() {
  let scanned = 0, changed = 0;

  for await (const rawKey of scanKeys('GH-*', 1000)) {
    // split in case redis key is a comma-separated list
    const auids = String(rawKey).split(',').map(s => s.trim()).filter(Boolean);

    for (const auid of auids) {
      scanned++;
      try {
        const hash = await hgetallSafe(auid);
        if (!hash || !hash.metadata) continue;

        const meta = safeJson(hash.metadata);
        if (!meta) continue;

        // Find the latest telemetry timestamp
        let latestTs = 0;
        for (const [field, raw] of Object.entries(hash)) {
          if (field === 'metadata' || !raw) continue;
          try {
            const doc = JSON.parse(raw);
            if (doc.ts && Number(doc.ts) > latestTs) latestTs = Number(doc.ts);
            else if (doc.telem_time) {
              const t = new Date(doc.telem_time).getTime();
              if (t > latestTs) latestTs = t;
            }
          } catch {}
        }

        const newStatus = getStatusFromTimestamp(latestTs);
        if (meta.status !== newStatus) {
          meta.status = newStatus;
          await redis.hSet(auid, 'metadata', JSON.stringify(meta));
          changed++;
          console.log(`🔄 ${auid} → ${newStatus}`);
        }

      } catch (err) {
        console.error(`❌ Error processing ${auid}:`, err.message);
      }
    }
  }

  console.log(`📊 Status update done: scanned=${scanned}, changed=${changed}`);
}


function startUpdateRedisStatusCron() {
  const schedule = process.env.DEVICE_STATUS_CRON || '*/10 * * * *'; // every 10 minutes
  cron.schedule(schedule, updateRedisDeviceStatusesOnce, { timezone: 'Africa/Accra' });
  console.log('⏱️ Redis device status cron scheduled');
}

module.exports = { startUpdateRedisStatusCron, updateRedisDeviceStatusesOnce };
