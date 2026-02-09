const RegisterDevice = require('../models/devices/registerDevice');

// ...

// 4. Update ONLY if status changed
if (meta.status !== newStatus) {
  const oldStatus = meta.status;
  meta.status = newStatus;
  meta.statusUpdatedAt = new Date().toISOString();

  await redis.hSet(auid, 'metadata', JSON.stringify(meta));

  // ⚡ SYNC TO MONGODB
  try {
    await RegisterDevice.updateOne(
      { auid },
      { $set: { status: newStatus, lastSeen: new Date(lastSeen) } }
    );
    console.log(`🔄 ${auid} status changed: ${oldStatus} → ${newStatus} (Synced to DB)`);
  } catch (dbErr) {
    console.error(`❌ Failed to sync DB status for ${auid}:`, dbErr.message);
  }

  changed++;
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
