const cron = require('node-cron');
const { client: redis } = require('../config/redis/redis');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function normalizeTimestamp(ts) {
  if (!ts) return 0;
  ts = Number(ts);
  // If looks like seconds → convert to ms
  if (ts < 1e12) return ts * 1000;
  return ts;
}

function getStatusFromTimestamp(ts, thresholdMin = 30) {
  if (!ts) return 'offline';
  const diff = (Date.now() - ts) / 60000; // ms → minutes
  return diff <= thresholdMin ? 'online' : 'offline';
}

// ---------------------------------------------------------------------------
// MAIN JOB
// ---------------------------------------------------------------------------

async function updateRedisDeviceStatusesOnce() {
  let scanned = 0;
  let changed = 0;

  const thresholdMin = Number(process.env.DEVICE_STATUS_THRESHOLD_MINUTES || 30);
  const deviceList = [];

  for await (const rawKey of scanKeys('GH-*', 1000)) {
    const auids = String(rawKey).split(',').map(s => s.trim()).filter(Boolean);

    for (const auid of auids) {
      scanned++;

      try {
        const hash = await hgetallSafe(auid);
        if (!hash) {
          deviceList.push({
            auid,
            metadata: false,
            telemetry: false,
            latestTs: null,
            status: "offline",
          });
          continue;
        }

        const meta = safeJson(hash.metadata) || {};
        const hasMeta = !!hash.metadata;

        let latestTs = 0;
        let hasTelemetry = false;

        for (const [field, raw] of Object.entries(hash)) {
          if (field === 'metadata' || !raw) continue;

          try {
            const doc = JSON.parse(raw);
            hasTelemetry = true;

            if (doc.ts) {
              const t = normalizeTimestamp(doc.ts);
              if (t > latestTs) latestTs = t;
            } else if (doc.telem_time) {
              const t = new Date(doc.telem_time).getTime();
              if (t > latestTs) latestTs = t;
            }
          } catch { /* ignore bad JSON */ }
        }

        const newStatus = getStatusFromTimestamp(latestTs, thresholdMin);

        // 🔴 THIS is where we update Redis metadata.status (and only that)
        if (hasMeta && meta.status !== newStatus) {
          const oldStatus = meta.status;
          meta.status = newStatus;
          meta.statusUpdatedAt = new Date().toISOString(); // optional, but useful

          await redis.hSet(auid, 'metadata', JSON.stringify(meta));
          changed++;

          console.log(`🔄 ${auid} status changed: ${oldStatus} → ${newStatus}`);
        }

        deviceList.push({
          auid,
          metadata: hasMeta,
          telemetry: hasTelemetry,
          latestTs,
          status: newStatus,
        });

      } catch (err) {
        console.error(`❌ Error processing ${auid}:`, err.message);
      }
    }
  }

  console.log(`\n📊 Status Cron Completed: scanned=${scanned}, changed=${changed}`);

  console.log("\n===================== DEVICE LIST =====================");
  if (deviceList.length === 0) {
    console.log("⚠️ No devices found in Redis.");
  } else {
    for (const d of deviceList) {
      console.log(`
📌 ${d.auid}
   • Metadata:    ${d.metadata ? "✓" : "✗"}
   • Telemetry:   ${d.telemetry ? "✓" : "✗"}
   • Latest TS:   ${d.latestTs ? new Date(d.latestTs).toISOString() : "None"}
   • Status:      ${d.status}
`);
    }
  }
  console.log("=======================================================\n");
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
