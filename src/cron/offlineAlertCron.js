const cron = require('node-cron');
const { client: redis } = require('../config/redis/redis');
const RegisterDevice = require('../models/devices/registerDevice');
const { alertQueue } = require('../config/queue/bullMQ/alertQueue');
const logger = require('../utils/logger');
const eventLog = require('../modules/devices/eventLog/eventLog.service');
const { formatDuration } = require('../utils/formatDuration');

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const ALERT_CHECK_INTERVAL = process.env.OFFLINE_CHECK_INTERVAL || '* * * * *'; // Every minute

function getAlertStagesForDevice(device) {
    const frequency = device.frequency || 30;
    const batch = device.batch || 2;
    const alertThresholdMinutes = device.notificationPreferences?.alertThresholdMinutes;
    // Base Threshold: custom alertThresholdMinutes || (frequency * batch) + 5 minutes safety margin
    const baseThreshold = alertThresholdMinutes || ((frequency * batch) + 5);
    return [
        { level: 1, minMinutes: baseThreshold, tag: 'WARNING' },
        { level: 2, minMinutes: baseThreshold * 8, tag: 'CRITICAL' },
        { level: 3, minMinutes: baseThreshold * 20, tag: 'SEVERE' }
    ];
}

// ---------------------------------------------------------------------------
// MAIN LOGIC
// ---------------------------------------------------------------------------

async function checkOfflineDevices() {
    const now = Date.now();
    // We fetch any device that has not checked in for at least 2 minutes (the minimum possible threshold)
    const cutoff = now - (2 * 60 * 1000);

    try {
        // 1. Find candidates (Offline > 2 mins)
        let offlineCandidates;
        if (typeof redis.zRangeByScore === 'function') {
            offlineCandidates = await redis.zRangeByScore('devices:heartbeat', 0, cutoff);
        } else {
            offlineCandidates = await redis.zrangebyscore('devices:heartbeat', 0, cutoff);
        }

        if (!offlineCandidates.length) return;

        // 2. Process Candidates
        for (const auid of offlineCandidates) {
            const lastSeenScore = await redis.zScore('devices:heartbeat', auid);
            if (!lastSeenScore) continue;

            const lastSeen = Number(lastSeenScore);
            const minutesOffline = (now - lastSeen) / 60000;

            // Load device metadata from Redis cache or MongoDB (Warm cache)
            const cacheKey = `device:${auid}:meta`;
            let cachedDataRaw = await redis.get(cacheKey);
            let device;

            if (cachedDataRaw) {
                try {
                    device = JSON.parse(cachedDataRaw);
                } catch (e) {
                    logger.warn(`Failed to parse cached metadata for device ${auid}`);
                }
            }

            if (!device) {
                device = await RegisterDevice.findOne({ auid });
                if (!device) {
                    // Cleanup orphan heartbeat
                    if (typeof redis.zRem === 'function') {
                        await redis.zRem('devices:heartbeat', auid);
                    } else {
                        await redis.zrem('devices:heartbeat', auid);
                    }
                    continue;
                }
                // Save to cache (Warming)
                await redis.set(cacheKey, JSON.stringify(device), { EX: 24 * 60 * 60 });
            }

            // ⚡ STATE GUARD: Skip inactive/disabled devices immediately.
            // If a device was deliberately turned off, we do NOT alert.
            // Also remove it from heartbeat ZSet so we don't re-process it every minute.
            const deviceState = device.state || 'active';
            if (deviceState === 'inactive' || deviceState === 'disabled') {
                logger.debug(`[OfflineAlert] Skipping device ${auid} — state is '${deviceState}' (intentionally off).`);
                if (typeof redis.zRem === 'function') {
                    await redis.zRem('devices:heartbeat', auid);
                } else {
                    await redis.zrem('devices:heartbeat', auid);
                }
                continue;
            }

            // Calculate alert stages dynamically using per-device config (frequency & batch)
            const alertStages = getAlertStagesForDevice(device);

            // Determine Target Stage (highest qualified)
            let targetStage = null;
            for (let i = alertStages.length - 1; i >= 0; i--) {
                if (minutesOffline >= alertStages[i].minMinutes) {
                    targetStage = alertStages[i];
                    break;
                }
            }

            if (!targetStage) continue; // Not offline long enough

            // Update Dashboard Status to 'offline' in Redis immediately (Zero Stale UI Data)
            try {
                const metaStr = await redis.hGet(auid, 'metadata');
                if (metaStr) {
                    const meta = JSON.parse(metaStr);
                    if (meta.status !== 'offline') {
                        meta.status = 'offline';
                        meta.statusUpdatedAt = new Date().toISOString();
                        await redis.hSet(auid, 'metadata', JSON.stringify(meta));

                        await RegisterDevice.updateOne(
                            { auid },
                            {
                                $set: {
                                    status: 'offline',
                                    lastSeen: new Date(lastSeen),
                                },
                            }
                        );
                        
                        // 📣 Publish real-time status change event
                        await redis.publish('device:status-change', JSON.stringify({ auid, status: 'offline' }));
                        logger.info(`📣 Published offline status for device ${auid}`);

                        // 📋 EVENT LOG — device went offline
                        eventLog.offline({
                            auid,
                            devid:         device.devid,
                            userId:        device.userid || device.userId,
                            orgId:         device.organizationId,
                            minutesOffline: Math.round(minutesOffline),
                            lastSeen:      new Date(lastSeen).toISOString(),
                        }).catch(() => {});
                    }
                }
            } catch (e) { /* ignore */ }

            // Check current alert context to prevent duplicate notifications
            const contextKey = `device:${auid}:alert_context`;
            const currentContext = await redis.hGetAll(contextKey);
            const currentLevel = currentContext && currentContext.level ? Number(currentContext.level) : 0;

            // If we have escalated
            if (targetStage.level > currentLevel) {

                // Flapping Anti-Spam Check (for Level 1 alerts)
                if (targetStage.level === 1) {
                    const lastAlertTimeRaw = await redis.get(`device:${auid}:last_alert_time`);
                    if (lastAlertTimeRaw) {
                        const timeSinceLastAlert = now - Number(lastAlertTimeRaw);
                        const cooldownMs = (parseInt(process.env.ALERT_FLAPPING_COOLDOWN_MINUTES, 10) || 30) * 60 * 1000;
                        if (timeSinceLastAlert < cooldownMs) {
                            logger.info(`[OfflineAlert] Suppressed Level 1 alert for device ${device.auid} due to flapping cooldown (${Math.round(timeSinceLastAlert / 60000)}m ago).`);
                            continue;
                        }
                    }
                }

                // Decouple: Add alert job to background BullMQ queue
                logger.info(`📥 Queuing offline alert job for device ${auid} (Level ${targetStage.level})`);

                // Fetch degraded batch context for richer alert templates
                let consecutivePartials = 0;
                try {
                    const cpRaw = await redis.get(`device:${auid}:consecutive_partials`);
                    if (cpRaw) consecutivePartials = parseInt(cpRaw, 10) || 0;
                } catch (_) { /* non-fatal */ }

                await alertQueue.add(`offline-alert:${auid}:${targetStage.level}`, {
                    auid,
                    lastSeen,
                    targetStage,
                    now,
                    consecutivePartials,
                    minutesOffline: Math.round(minutesOffline),
                });

                // Optimistically update context to prevent queuing duplicate alert jobs
                await redis.hSet(contextKey, {
                    level: targetStage.level,
                    lastAlertAt: now,
                    lastStageTag: targetStage.tag
                });
                await redis.expire(contextKey, 48 * 3600);
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
    console.log('⏱️ Offline Alert Cron scheduled (3-Stage Logic & Background Alerting)');
}

module.exports = { startOfflineAlertCron, checkOfflineDevices, getAlertStagesForDevice, formatDuration };
