'use strict';
const { v4: uuidv4 } = require('uuid');
const DeviceEventLog  = require('../../../models/devices/deviceEventLog');

/**
 * DeviceEventLogService
 *
 * All writes are fire-and-forget (non-blocking) — device events must never
 * block the hot path (MQTT ingest, status worker, alert worker).
 *
 * Reads are paginated and filterable by auid, userId, orgId, eventType,
 * severity, and date range.
 */
class DeviceEventLogService {

    // ── Write helpers ─────────────────────────────────────────────────────────

    /**
     * Append a single event to the device log.
     * Returns a Promise — callers should `.catch(() => {})` if non-critical.
     */
    async append({ auid, devid, userId, orgId, eventType, severity = 'INFO', message, metadata = {} }) {
        try {
            const logId = `DEL-${uuidv4()}`;
            await DeviceEventLog.create({
                logId,
                auid,
                devid,
                userId,
                orgId,
                eventType,
                severity,
                message,
                metadata,
            });
        } catch (err) {
            // Never throw — log writes are best-effort
            console.error(`[DeviceEventLog] Write failed for ${auid} (${eventType}): ${err.message}`);
        }
    }

    /** Shorthand wrappers for common event types */

    online({ auid, devid, userId, orgId, metadata }) {
        return this.append({
            auid, devid, userId, orgId,
            eventType: 'ONLINE',
            severity:  'INFO',
            message:   `Device ${devid || auid} came online`,
            metadata,
        });
    }

    offline({ auid, devid, userId, orgId, minutesOffline, lastSeen, metadata }) {
        return this.append({
            auid, devid, userId, orgId,
            eventType: 'OFFLINE',
            severity:  'WARNING',
            message:   `Device ${devid || auid} went offline — last seen ${minutesOffline != null ? minutesOffline + ' min ago' : lastSeen || 'unknown'}`,
            metadata:  { minutesOffline, lastSeen, ...metadata },
        });
    }

    degraded({ auid, devid, userId, orgId, consecutivePartials, batchSeq }) {
        return this.append({
            auid, devid, userId, orgId,
            eventType: 'DEGRADED',
            severity:  'WARNING',
            message:   `Device ${devid || auid} is degraded — ${consecutivePartials} consecutive partial batch(es) (last: #${batchSeq})`,
            metadata:  { consecutivePartials, batchSeq },
        });
    }

    batchConfirmed({ auid, devid, userId, orgId, batchSeq, received, expected }) {
        return this.append({
            auid, devid, userId, orgId,
            eventType: 'BATCH_CONFIRMED',
            severity:  'INFO',
            message:   `Batch #${batchSeq} confirmed — received ${received}/${expected} readings`,
            metadata:  { batchSeq, received, expected },
        });
    }

    batchMismatch({ auid, devid, userId, orgId, batchSeq, received, expected }) {
        return this.append({
            auid, devid, userId, orgId,
            eventType: 'BATCH_MISMATCH',
            severity:  'WARNING',
            message:   `Batch #${batchSeq} mismatch — received ${received} but expected ${expected} readings`,
            metadata:  { batchSeq, received, expected },
        });
    }

    configChanged({ auid, devid, userId, orgId, before, after }) {
        return this.append({
            auid, devid, userId, orgId,
            eventType: 'CONFIG_CHANGED',
            severity:  'INFO',
            message:   `Device config updated`,
            metadata:  { before, after },
        });
    }

    alertFired({ auid, devid, userId, orgId, alertLevel, alertTag, recipientCount, emailCount, smsCount }) {
        return this.append({
            auid, devid, userId, orgId,
            eventType: 'ALERT_FIRED',
            severity:  alertLevel >= 3 ? 'ERROR' : 'WARNING',
            message:   `[${alertTag}] Alert dispatched to ${recipientCount} recipient(s)`,
            metadata:  { alertLevel, alertTag, recipientCount, emailCount, smsCount },
        });
    }

    stateChanged({ auid, devid, userId, orgId, from, to }) {
        return this.append({
            auid, devid, userId, orgId,
            eventType: 'STATE_CHANGED',
            severity:  'INFO',
            message:   `Device state changed: ${from} → ${to}`,
            metadata:  { from, to },
        });
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    /**
     * Query device event logs with filters.
     *
     * @param {object} filters
     * @param {string}   [filters.auid]       — specific device
     * @param {string}   [filters.userId]     — all devices owned by user
     * @param {string}   [filters.orgId]      — all devices in org
     * @param {string[]} [filters.eventTypes] — filter by event type(s)
     * @param {string[]} [filters.severities] — filter by severity level(s)
     * @param {Date}     [filters.from]       — start of date range
     * @param {Date}     [filters.to]         — end of date range
     * @param {number}   [filters.page]       — page number (default 1)
     * @param {number}   [filters.limit]      — page size (default 50, max 200)
     * @returns {{ logs: DeviceEventLog[], total: number, page: number, pages: number }}
     */
    async query({ auid, userId, orgId, eventTypes, severities, from, to, page = 1, limit = 50 }) {
        const filter = {};

        if (auid)              filter.auid      = auid;
        if (userId && !auid)   filter.userId    = userId;
        if (orgId  && !auid)   filter.orgId     = orgId;

        if (eventTypes?.length) filter.eventType = { $in: eventTypes };
        if (severities?.length) filter.severity  = { $in: severities };

        if (from || to) {
            filter.createdAt = {};
            if (from) filter.createdAt.$gte = new Date(from);
            if (to)   filter.createdAt.$lte = new Date(to);
        }

        const safePage  = Math.max(1, parseInt(page, 10) || 1);
        const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const skip      = (safePage - 1) * safeLimit;

        const [logs, total] = await Promise.all([
            DeviceEventLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
            DeviceEventLog.countDocuments(filter),
        ]);

        return {
            logs,
            total,
            page:  safePage,
            pages: Math.ceil(total / safeLimit),
            limit: safeLimit,
        };
    }

    /**
     * Get the latest N events for a device (for dashboard widgets).
     */
    async latest(auid, n = 20) {
        return DeviceEventLog.find({ auid }).sort({ createdAt: -1 }).limit(n).lean();
    }

    /**
     * Count events by type for a device in a time window.
     * Used to detect degraded state (e.g. count BATCH_MISMATCH in last 30 min).
     */
    async countRecent(auid, eventType, windowMinutes = 30) {
        const since = new Date(Date.now() - windowMinutes * 60 * 1000);
        return DeviceEventLog.countDocuments({ auid, eventType, createdAt: { $gte: since } });
    }
}

module.exports = new DeviceEventLogService();
