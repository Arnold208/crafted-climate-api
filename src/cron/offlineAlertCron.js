const cron = require('node-cron');
const { client: redis } = require('../config/redis/redis');
const RegisterDevice = require('../models/devices/registerDevice');
const NotificationPreference = require('../models/notification/NotificationPreference');
const notificationService = require('../services/notification.service');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const ALERT_CHECK_INTERVAL = process.env.OFFLINE_CHECK_INTERVAL || '*/10 * * * *'; // Every 10 mins

/**
 * Get notification stage configuration
 * @param {number} thresholdMinutes Base threshold from device config
 */
const getStageConfig = (thresholdMinutes) => [
    { level: 1, minMinutes: thresholdMinutes, tag: 'WARNING', template: 'device-offline-warning' },
    { level: 2, minMinutes: 600, tag: 'CRITICAL', template: 'device-offline-critical' }, // 10 hours
    { level: 3, minMinutes: 1440, tag: 'SEVERE', template: 'device-offline-severe' }   // 24 hours
];

// ---------------------------------------------------------------------------
// MAIN LOGIC
// ---------------------------------------------------------------------------

async function checkOfflineDevices() {
    console.log('[OfflineAlert] Running 3-Stage Alert Check...');

    const now = Date.now();
    // We use a safe broad cutoff for the initial Redis query. 
    // Devices with very long sync intervals might have high thresholds.
    // Let's assume max threshold is 24h.
    const broadCutoff = now - (30 * 60 * 1000); // Check anything not seen in 30 mins

    try {
        // 1. Get all potential offline candidates from ZSET
        let offlineCandidates;
        if (typeof redis.zRangeByScore === 'function') {
            offlineCandidates = await redis.zRangeByScore('devices:heartbeat', 0, now - (30 * 60 * 1000));
        } else {
            offlineCandidates = await redis.zrangebyscore('devices:heartbeat', 0, now - (30 * 60 * 1000));
        }

        if (!offlineCandidates.length) return;

        // 2. Fetch device details for candidates
        const devices = await RegisterDevice.find({
            auid: { $in: offlineCandidates },
            'notificationPreferences.enabled': { $ne: false },
            'notificationPreferences.offlineAlert': { $ne: false }
        });

        for (const device of devices) {
            const lastSeenScore = await redis.zScore('devices:heartbeat', device.auid);
            if (!lastSeenScore) continue;

            const lastSeen = Number(lastSeenScore);
            const minutesOffline = (now - lastSeen) / 60000;

            const threshold = device.notificationPreferences?.alertThresholdMinutes || 70;
            const stages = getStageConfig(threshold);

            // Find highest applicable stage
            let targetStage = null;
            for (let i = stages.length - 1; i >= 0; i--) {
                if (minutesOffline >= stages[i].minMinutes) {
                    targetStage = stages[i];
                    break;
                }
            }

            if (!targetStage) continue;

            // Check if already alerted for this stage
            const contextKey = `device:${device.auid}:alert_context`;
            const currentLevel = await redis.hGet(contextKey, 'level');

            if (!currentLevel || Number(currentLevel) < targetStage.level) {
                // Trigger Alert
                await triggerAlert(device, targetStage, lastSeen);

                // Update Context (expire in 48h)
                await redis.hSet(contextKey, {
                    level: targetStage.level,
                    lastAlertAt: now,
                    lastStageTag: targetStage.tag
                });
                await redis.expire(contextKey, 48 * 3600);
            }
        }
    } catch (err) {
        logger.error('❌ Offline Alert Cron Error:', err);
    }
}

async function triggerAlert(device, stage, lastSeen) {
    try {
        // Check User Global Preferences
        const userPrefs = await NotificationPreference.findOne({ userid: device.userid });

        if (userPrefs) {
            // 1. Check if device is muted by user
            if (userPrefs.mutedDevices && userPrefs.mutedDevices.includes(device.auid)) {
                logger.debug(`[OfflineAlert] User ${device.userid} muted device ${device.auid}`);
                return;
            }

            // 2. Check if Alerts category is disabled
            if (userPrefs.preferences?.categories?.alerts === false) {
                logger.debug(`[OfflineAlert] User ${device.userid} disabled alerts category`);
                return;
            }
        }

        const notificationData = {
            userid: device.userid,
            title: `Alert: ${device.metadata?.nickname || device.auid} is Offline`,
            message: `Device ${device.metadata?.nickname || device.auid} has been offline for ${Math.floor((Date.now() - lastSeen) / 60000)} minutes.`,
            type: 'warning',
            category: 'alerts',
            data: {
                auid: device.auid,
                stage: stage.tag,
                lastSeen: new Date(lastSeen).toLocaleString(),
                nickname: device.metadata?.nickname,
                devid: device.devid
            },
            template: stage.template
        };

        await notificationService.send(device.userid, notificationData);
        logger.info(`📢 Sent [${stage.tag}] alert for ${device.auid}`);

    } catch (err) {
        logger.error(`❌ Failed to trigger alert for ${device.auid}:`, err);
    }
}

// ---------------------------------------------------------------------------
// SCHEDULER
// ---------------------------------------------------------------------------
function startOfflineAlertCron() {
    cron.schedule(ALERT_CHECK_INTERVAL, checkOfflineDevices);
    console.log('⏱️ Dynamic Offline Alert Cron scheduled:', ALERT_CHECK_INTERVAL);
}

module.exports = { startOfflineAlertCron, checkOfflineDevices };
