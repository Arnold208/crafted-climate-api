const cron = require('node-cron');
const { client: redis } = require('../config/redis/redis');
const registerNewDevice = require('../model/devices/registerDevice'); // Correct path based on file location

// 1. Get threshold from ENV or default to 15
const THRESHOLD_MIN = parseInt(process.env.DEVICE_STATUS_THRESHOLD_MINUTES || '15', 10);

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

const getNum = (v) => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

function getStatusFromTimestamp(ts) {
  if (!ts) return 'offline';

  // Heuristic: If timestamp is small (10 digits), it's likely seconds -> convert to ms
  let ms = Number(ts);
  if (ms < 100000000000) ms *= 1000;

  const now = Date.now();
  const diff = (now - ms) / 60000;

  // Log large differences to help debug
  if (diff > THRESHOLD_MIN) {
    console.log(`⏱️ Device check: Last seen ${ms} (${new Date(ms).toISOString()}), Now ${now}, Diff ${diff.toFixed(1)} min > ${THRESHOLD_MIN} min`);
  }

  return diff <= THRESHOLD_MIN ? 'online' : 'offline';
}

async function updateRedisDeviceStatusesOnce() {
  let scanned = 0, changed = 0;

  for await (const rawKey of scanKeys('GH-*', 1000)) {
    const auids = String(rawKey).split(',').map(s => s.trim()).filter(Boolean);

    for (const auid of auids) {
      scanned++;
      try {
        const hash = await hgetallSafe(auid);
        if (!hash || !hash.metadata) continue;

        const meta = safeJson(hash.metadata);
        if (!meta) continue;

        let latestTs = 0;
        for (const [field, raw] of Object.entries(hash)) {
          if (field === 'metadata' || !raw) continue;
          try {
            const doc = JSON.parse(raw);
            let t = 0;
            if (doc.ts) t = getNum(doc.ts);
            else if (doc.telem_time) {
              if (!isNaN(doc.telem_time)) t = getNum(doc.telem_time);
              else t = new Date(doc.telem_time).getTime();
            }
            if (t > 0 && t < 100000000000) t *= 1000;
            if (t > latestTs) latestTs = t;
          } catch { }
        }

        const newStatus = getStatusFromTimestamp(latestTs);

        // 1. Sync Logic: Even if Redis status is same, check MongoDB
        // We do this inside the loop to catch any drift

        // Check MongoDB Status
        const dbDevice = await registerNewDevice.findOne({ auid }).select('status userid nickname');
        const dbStatus = dbDevice ? dbDevice.status : 'unknown';

        let statusChangedInRedis = false;
        if (meta.status !== newStatus) {
          statusChangedInRedis = true;
          const oldStatus = meta.status;
          meta.status = newStatus;

          let alertSent = false;
          // --- ALERT LOGIC (Rate Limited: Once per day per status) ---
          if ((oldStatus === 'online' && newStatus === 'offline') || (oldStatus === 'offline' && newStatus === 'online')) {
            try {
              const today = new Date().toDateString(); // e.g. "Fri Jan 28 2026"
              const alertKey = `lastAlert_${newStatus}`; // lastAlert_online or lastAlert_offline

              if (meta[alertKey] !== today) {
                const User = require('../model/user/userModel');
                const { sendSMS } = require('../config/sms/sms');

                if (dbDevice && dbDevice.userid) {
                  const user = await User.findOne({ userid: dbDevice.userid });
                  if (user && user.contact) {
                    const message = `Alert: Your device ${dbDevice.nickname || auid} is now ${newStatus.toUpperCase()}.`;
                    const contact = user.contact;

                    if (contact && (contact.length === 12 && contact.startsWith('233'))) {
                      await sendSMS(contact, message);
                      console.log(`📢 SMS sent to ${contact}: ${message}`);

                      // Mark as sent for today
                      meta[alertKey] = today;
                      alertSent = true;
                    }
                  }
                }
              } else {
                console.log(`hz Skipping ${newStatus} alert for ${auid}: Already sent today.`);
              }
            } catch (alertErr) {
              console.error(`❌ Failed to send alert for ${auid}:`, alertErr.message);
            }
          }
          // --- END ALERT LOGIC ---

          // Update Redis (Status + Alert Metadata)
          await redis.hSet(auid, 'metadata', JSON.stringify(meta));
          changed++;
          console.log(`🔄 ${auid} status changed (Redis): ${oldStatus} → ${newStatus}`);
        }

        // 2. Sync to MongoDB if different, regardless of Redis change
        if (dbDevice && dbDevice.status !== newStatus) {
          await registerNewDevice.updateOne({ auid }, { status: newStatus });
          console.log(`💾 Synced ${auid} status to MongoDB: ${dbDevice.status} → ${newStatus}`);
        }

      } catch (err) {
        console.error(`❌ Error processing ${auid}:`, err.message);
      }
    }
  }

  console.log(`📊 Status update done: scanned=${scanned}, changed=${changed}`);
}


function startUpdateRedisStatusCron() {
  const schedule = process.env.DEVICE_STATUS_CRON || '*/10 * * * *';
  cron.schedule(schedule, updateRedisDeviceStatusesOnce, { timezone: 'Africa/Accra' });
  console.log('⏱️ Redis device status cron scheduled');

  // Run immediately on startup
  console.log('🚀 Running initial device status check...');
  updateRedisDeviceStatusesOnce();
}

module.exports = { startUpdateRedisStatusCron, updateRedisDeviceStatusesOnce };
