const cron = require('node-cron');
const RegisterDevice = require('../models/devices/registerDevice');
const { client: redis } = require('../config/redis/redis');
const { createAuditLog } = require('../utils/auditLogger');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

/**
 * Auto-disable threshold: 30 days.
 * If a device has been `inactive` for this long without being re-activated,
 * it is automatically promoted to `disabled`.
 *
 * Why 30 days?
 *  - Covers seasonal deployments, long maintenance windows, etc.
 *  - Short enough to keep data fresh and alert rosters clean.
 *  - Configurable via env: AUTO_DISABLE_INACTIVE_DAYS
 */
const AUTO_DISABLE_DAYS = parseInt(process.env.AUTO_DISABLE_INACTIVE_DAYS || '30', 10);

// Run once per day at 02:00 UTC (low-traffic window)
const AUTO_DISABLE_SCHEDULE = process.env.AUTO_DISABLE_CRON || '0 2 * * *';

// ---------------------------------------------------------------------------
// MAIN LOGIC
// ---------------------------------------------------------------------------

async function autoDisableInactiveDevices() {
    const cutoffDate = new Date(Date.now() - AUTO_DISABLE_DAYS * 24 * 60 * 60 * 1000);

    logger.info(`[AutoDisableCron] Scanning for devices inactive since before ${cutoffDate.toISOString()}...`);

    try {
        // Efficient compound index query: state=inactive AND stateChangedAt < cutoff
        // Uses the index: { state: 1, stateChangedAt: 1 }
        const staleDevices = await RegisterDevice.find(
            {
                state: 'inactive',
                stateChangedAt: { $lt: cutoffDate },
                deletedAt: null
            },
            { auid: 1, organizationId: 1, stateChangedAt: 1, nickname: 1 }  // projection — only what we need
        ).lean();

        if (!staleDevices.length) {
            logger.info('[AutoDisableCron] No stale inactive devices found. All clean.');
            return;
        }

        logger.info(`[AutoDisableCron] Found ${staleDevices.length} device(s) to auto-disable.`);

        const now = new Date();
        const auids = staleDevices.map(d => d.auid);

        // Batch update in MongoDB (single atomic write)
        await RegisterDevice.updateMany(
            { auid: { $in: auids } },
            {
                $set: {
                    state: 'disabled',
                    stateChangedAt: now,
                    stateChangedBy: 'system:auto-disable',
                    status: 'disabled'
                }
            }
        );

        logger.info(`[AutoDisableCron] ✅ Auto-disabled ${auids.length} device(s).`);

        // Invalidate Redis meta cache + remove from heartbeat ZSet for each device
        const pipeline = redis.multi();
        for (const { auid } of staleDevices) {
            pipeline.del(`device:${auid}:meta`);
            pipeline.del(`device:${auid}:alert_context`);
            pipeline.del(`device:${auid}:last_alert_time`);

            // Publish real-time event (dashboard immediately shows 'disabled')
            pipeline.publish('device:status-change', JSON.stringify({
                auid,
                status: 'disabled',
                state: 'disabled',
                stateChangedAt: now.toISOString(),
                changedBy: 'system:auto-disable'
            }));

            // Remove from heartbeat ZSet
            if (typeof pipeline.zRem === 'function') {
                pipeline.zRem('devices:heartbeat', auid);
            } else {
                pipeline.zadd('devices:heartbeat', '-inf', auid); // Fallback: score to past
            }
        }
        await pipeline.exec();

        // Audit log (batch)
        for (const device of staleDevices) {
            await createAuditLog({
                action: 'DEVICE_AUTO_DISABLED',
                userid: null,
                organizationId: device.organizationId,
                details: {
                    auid: device.auid,
                    nickname: device.nickname,
                    inactiveSince: device.stateChangedAt,
                    disabledAt: now
                },
                ipAddress: null
            }).catch(() => {}); // Non-fatal
        }

    } catch (err) {
        logger.error('[AutoDisableCron] Error: %s', err.message);
    }
}

// ---------------------------------------------------------------------------
// SCHEDULER
// ---------------------------------------------------------------------------
function startAutoDisableCron() {
    cron.schedule(AUTO_DISABLE_SCHEDULE, autoDisableInactiveDevices);
    logger.info(`⏱️  Auto-Disable Cron scheduled: devices inactive > ${AUTO_DISABLE_DAYS} days → 'disabled' [${AUTO_DISABLE_SCHEDULE}]`);
}

module.exports = { startAutoDisableCron };
