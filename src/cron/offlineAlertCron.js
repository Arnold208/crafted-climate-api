const cron = require('node-cron');
const { client: redis } = require('../config/redis/redis');
const RegisterDevice = require('../models/devices/registerDevice');
const User = require('../models/user/userModel');
const { sendEmail } = require('../config/mail/nodemailer');

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const ALERT_CHECK_INTERVAL = process.env.OFFLINE_CHECK_INTERVAL || '* * * * *'; // Every minute
const DEFAULT_THRESHOLD_MIN = 30;
const ALERT_COOLDOWN_SEC = 24 * 60 * 60; // 24 hours before re-alerting

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
async function sendOfflineAlert(device, recipients) {
    const subject = `[Alert] Device Offline: ${device.nickname || device.devid}`;
    const text = `
    Hello,

    Your device "${device.nickname}" (ID: ${device.devid}) has gone offline.
    Last seen: ${new Date().toLocaleString()}
    
    Location: ${device.location}
    
    Please check the power and connectivity.

    CraftedClimate Team
    `;

    console.log(`📧 Sending Offline Alert for ${device.devid} to: ${recipients.join(', ')}`);
    // Iterate to be safe with individual sends or use BCC if mailer supports
    for (const email of recipients) {
        try {
            await sendEmail(email, subject, text);
        } catch (e) {
            console.error(`❌ Failed to email ${email}:`, e.message);
        }
    }
}

// ---------------------------------------------------------------------------
// MAIN LOGIC
// ---------------------------------------------------------------------------
const logger = require('../utils/logger');

async function checkOfflineDevices() {
    logger.info('🕵️ Checking for offline devices (ZSET approach)...');

    // 1. Calculate Cutoff
    // Any device with a heartbeat BEFORE this time is considered "potential offline"
    // We use the default threshold here for the primary query. 
    // Individual device overrides are checked later (or we query conservatively).
    const now = Date.now();
    const cutoff = now - (DEFAULT_THRESHOLD_MIN * 60 * 1000);

    try {
        // 2. Query ZSET for summary stats
        const totalInZset = await redis.zCard('devices:heartbeat');
        const offlineCount = await redis.zCount('devices:heartbeat', 0, cutoff);
        const onlineCount = totalInZset - offlineCount;

        logger.info(`📊 Device Status Summary: ${onlineCount} Online | ${offlineCount} Offline Candidates`);

        if (offlineCount === 0) {
            return;
        }

        // Returns [ 'devid1', 'devid2', ... ]
        let offlineCandidates;
        if (typeof redis.zRangeByScore === 'function') {
            offlineCandidates = await redis.zRangeByScore('devices:heartbeat', 0, cutoff);
        } else {
            offlineCandidates = await redis.zrangebyscore('devices:heartbeat', 0, cutoff);
        }

        console.log(`⚠️ Processing ${offlineCandidates.length} potential offline devices...`);

        // 3. Process Candidates
        for (const auid of offlineCandidates) {
            // A. Check if already alerted in Redis to avoid spam
            const alertKey = `device:${auid}:alert_state`; // Use AUID for alerting state consistency
            const alertState = await redis.get(alertKey);

            if (alertState === 'sent') {
                continue;
            }

            // B. Fetch Metadata from Cache (High Performance)
            const cacheKey = `device:cache:${auid}`;
            let metadataRaw = await redis.get(cacheKey);
            let metadata;

            if (metadataRaw) {
                metadata = JSON.parse(metadataRaw);
            } else {
                // Fallback to DB and warm cache
                const device = await RegisterDevice.findOne({ auid });
                if (!device) {
                    await redis.zRem('devices:heartbeat', auid);
                    continue;
                }
                metadata = {
                    prefs: device.notificationPreferences,
                    nickname: device.nickname,
                    location: device.location,
                    organizationId: device.organizationId,
                    userid: device.userid
                };
                await redis.set(cacheKey, JSON.stringify(metadata), 'EX', 24 * 60 * 60);
            }

            // C. Check Specific Threshold
            const threshold = metadata.prefs?.alertThresholdMinutes || DEFAULT_THRESHOLD_MIN;
            const deviceCutoff = now - (threshold * 60 * 1000);

            const score = await redis.zScore('devices:heartbeat', auid);
            if (score && score > deviceCutoff) {
                continue; // Not actually offline by its specific threshold
            }

            // D. Update Redis Metadata Status (Dashboard)
            // This ensures the dashboard reflects offline status immediately
            try {
                const metaFields = await redis.hGet(auid, 'metadata');
                if (metaFields) {
                    const dashboardMeta = JSON.parse(metaFields);
                    dashboardMeta.status = 'offline';
                    await redis.hSet(auid, 'metadata', JSON.stringify(dashboardMeta));
                }
            } catch (e) {
                console.warn(`[OfflineCron] Dashboard meta update failed for ${auid}:`, e.message);
            }

            // E. CHECK ALERTS ENABLED
            if (metadata.prefs?.offlineAlert === false) {
                await redis.set(alertKey, 'sent', { EX: ALERT_COOLDOWN_SEC });
                continue;
            }

            // F. GATHER RECIPIENTS (Still from DB for safety/collaborators if not in cache)
            // Optimization: Only do this if we actually need to send an email
            const recipients = new Set();
            if (metadata.prefs?.recipients?.length > 0) {
                metadata.prefs.recipients.forEach(e => recipients.add(e));
            } else {
                const owner = await User.findOne({ userid: metadata.userid });
                if (owner?.email) recipients.add(owner.email);

                // Fetch collaborators only if needed
                const deviceWithCollabs = await RegisterDevice.findOne({ auid }, { collaborators: 1 });
                if (deviceWithCollabs?.collaborators) {
                    for (const c of deviceWithCollabs.collaborators) {
                        if (['device-admin', 'device-support'].includes(c.role)) {
                            const u = await User.findOne({ userid: c.userid });
                            if (u?.email) recipients.add(u.email);
                        }
                    }
                }
            }

            // G. SEND & LOCK
            if (recipients.size > 0) {
                await sendOfflineAlert(device, Array.from(recipients));
            }

            // Mark as sent for 24h (or until online again)
            // Note: statusWorker should DEL this key when it sees a heartbeat!
            await redis.set(alertKey, 'sent', { EX: ALERT_COOLDOWN_SEC });
        }

    } catch (err) {
        logger.error('❌ Offline Alert Cron Error: %s', err.message);
    }
}

// ---------------------------------------------------------------------------
// SCHEDULER
// ---------------------------------------------------------------------------
function startOfflineAlertCron() {
    cron.schedule(ALERT_CHECK_INTERVAL, checkOfflineDevices);
    console.log('⏱️ Offline Alert Cron scheduled');
}

module.exports = { startOfflineAlertCron };
