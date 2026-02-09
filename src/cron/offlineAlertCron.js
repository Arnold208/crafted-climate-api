const cron = require('node-cron');
const { client: redis } = require('../config/redis/redis');
const RegisterDevice = require('../models/devices/registerDevice');
const User = require('../models/user/userModel');
const NotificationPreference = require('../models/notification/NotificationPreference');
const { sendSMS } = require('../config/sms/sms');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const ALERT_CHECK_INTERVAL = process.env.OFFLINE_CHECK_INTERVAL || '* * * * *'; // Every minute

// Stages: minMinutes = how long device must be offline to trigger
// level = identifier for the stage
const ALERT_STAGES = [
    { level: 1, minMinutes: 70, tag: 'WARNING' },
    { level: 2, minMinutes: 600, tag: 'CRITICAL' }, // 10 hours
    { level: 3, minMinutes: 1440, tag: 'SEVERE' }   // 24 hours
];

const emailTemplateService = require('../services/emailTemplate.service');

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function getStageConfig(stage, device, lastSeen) {
    const timeStr = new Date(lastSeen).toLocaleString();
    const nickname = device.nickname || device.devid;
    // Safe location access (assuming structure, fallback to empty)
    const location = device.metadata?.location || device.location || 'Unknown';

    let sms = '';
    let templateSlug = '';

    // Variables for the template
    const variables = {
        nickname,
        devid: device.devid,
        lastSeen: timeStr,
        location: typeof location === 'string' ? location : JSON.stringify(location)
    };

    switch (stage.level) {
        case 1:
            // Warning (70 mins)
            sms = `CraftedClimate Alert: ${nickname} has been offline since ${timeStr}. Please check power and connectivity.`;
            templateSlug = 'device-offline-warning';
            break;
        case 2:
            // Critical (10 Hours)
            sms = `Urgent: ${nickname} has been offline for over 10 hours. Please inspect the device immediately to prevent data loss.`;
            templateSlug = 'device-offline-critical';
            break;
        case 3:
            // Severe (24 Hours)
            sms = `Severe: ${nickname} has been offline for 24 hours. Immediate action required to restore data flow.`;
            templateSlug = 'device-offline-severe';
            break;
        default:
            return null;
    }

    return { sms, templateSlug, variables };
}

async function sendStageAlert(device, recipients, smsRecipients, stage, lastSeen) {
    const config = getStageConfig(stage, device, lastSeen);
    if (!config) return;

    logger.info(`📢 Sending [${stage.tag}] Alert for ${device.devid} to ${recipients.length} emails, ${smsRecipients.length} SMS`);

    // 1. Send Emails (via Template Service)
    // We run these in parallel
    await Promise.allSettled(recipients.map(email =>
        emailTemplateService.sendFromTemplate(config.templateSlug, email, config.variables)
            .catch(e => logger.error(`❌ Email Template failed for ${email}:`, e.message))
    ));

    // 2. Send SMS (Direct)
    await Promise.allSettled(smsRecipients.map(contact =>
        sendSMS(contact, config.sms)
            .catch(e => logger.error(`❌ SMS failed for ${contact}:`, e.message))
    ));
}

// ---------------------------------------------------------------------------
// MAIN LOGIC
// ---------------------------------------------------------------------------

async function checkOfflineDevices() {
    // logger.debug('🕵️ Checking for offline devices (3-Stage)...');

    const now = Date.now();
    // We only care about devices that have been offline for at least Stage 1 (70 mins)
    // So cutoff is 70 mins ago.
    const cutoff = now - (ALERT_STAGES[0].minMinutes * 60 * 1000);

    try {
        // 1. Find candidates (Offline > 70 mins)
        let offlineCandidates;
        if (typeof redis.zRangeByScore === 'function') {
            offlineCandidates = await redis.zRangeByScore('devices:heartbeat', 0, cutoff);
        } else {
            offlineCandidates = await redis.zrangebyscore('devices:heartbeat', 0, cutoff);
        }

        if (!offlineCandidates.length) return;

        // 2. Process Candidates
        for (const auid of offlineCandidates) {

            // A. Get Last Seen Score
            const lastSeenScore = await redis.zScore('devices:heartbeat', auid);
            if (!lastSeenScore) continue;

            const lastSeen = Number(lastSeenScore);
            const minutesOffline = (now - lastSeen) / 60000;

            // B. Determine Target Stage
            // We find the HIGHEST stage that this duration qualifies for.
            let targetStage = null;
            for (let i = ALERT_STAGES.length - 1; i >= 0; i--) {
                if (minutesOffline >= ALERT_STAGES[i].minMinutes) {
                    targetStage = ALERT_STAGES[i];
                    break;
                }
            }

            if (!targetStage) continue; // Should not happen given cutoff, but safety check

            // C. Check Current Alert Context
            const contextKey = `device:${auid}:alert_context`;
            const currentContext = await redis.hGetAll(contextKey); // { level, lastAlertAt }
            const currentLevel = currentContext && currentContext.level ? Number(currentContext.level) : 0;

            // D. Alert if we have escalated
            if (targetStage.level > currentLevel) {

                // Fetch Metadata/Recipients
                // (Optimized: Only fetch if we are actually alerting)
                const device = await RegisterDevice.findOne({ auid });
                if (!device) {
                    await redis.zRem('devices:heartbeat', auid);
                    continue;
                }

                // Check preferences
                if (device.notificationPreferences?.offlineAlert === false) continue;

                // Gather Recipients
                const emails = new Set();
                const phones = new Set();

                // D1. Owner
                const owner = await User.findOne({ userid: device.userid });
                if (owner) {
                    // Fetch consolidated preferences
                    const prefs = await NotificationPreference.findOne({ userid: owner.userid });

                    if (prefs) {
                        // Check if device is muted
                        if (prefs.mutedDevices && prefs.mutedDevices.includes(device.deviceId)) {
                            console.log(`[OfflineAlert] Suppressed: Device ${device.deviceId} is muted for user ${owner.userid}`);
                            continue;
                        }

                        // Check global settings
                        const emailEnabled = prefs.preferences?.email?.enabled !== false;
                        const pushEnabled = prefs.preferences?.push?.enabled !== false;

                        if (emailEnabled) emails.add(owner.email);
                        if (pushEnabled) phones.add(owner.contact);
                    } else {
                        // Fallback to default behavior if no prefs document
                        if (owner.email) emails.add(owner.email);
                        if (owner.contact) phones.add(owner.contact);
                    }
                }

                // D2. Collaborators / Custom List
                if (device.notificationPreferences?.recipients?.length > 0) {
                    device.notificationPreferences.recipients.forEach(e => emails.add(e));
                }

                // Add Device Collaborators
                if (device.collaborators?.length > 0) {
                    for (const c of device.collaborators) {
                        if (['device-admin', 'device-support'].includes(c.role)) {
                            const u = await User.findOne({ userid: c.userid });
                            if (u) {
                                if (u.email) emails.add(u.email);
                                if (u.contact) phones.add(u.contact);
                            }
                        }
                    }
                }

                // E. Send Alert
                await sendStageAlert(device, Array.from(emails), Array.from(phones), targetStage, lastSeen);

                // F. Update Context
                await redis.hSet(contextKey, {
                    level: targetStage.level,
                    lastAlertAt: now,
                    lastStageTag: targetStage.tag
                });
                // Expire context after 48 hours of no updates (cleanup if device removed)
                // But generally, reset happens on recovery in redisTelemetry.js
                await redis.expire(contextKey, 48 * 3600);

                // G. Update Dashboard Status (if not already offline)
                try {
                    const metaStr = await redis.hGet(auid, 'metadata');
                    if (metaStr) {
                        const meta = JSON.parse(metaStr);
                        if (meta.status !== 'offline') {
                            meta.status = 'offline';
                            await redis.hSet(auid, 'metadata', JSON.stringify(meta));
                        }
                    }
                } catch (e) { /* ignore */ }
            }
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
    console.log('⏱️ Offline Alert Cron scheduled (3-Stage Logic)');
}

module.exports = { startOfflineAlertCron };
