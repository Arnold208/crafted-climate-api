'use strict';
const eventLogService = require('./eventLog.service');

class EventLogController {

    /**
     * GET /api/devices/:auid/logs
     * Get event log for a specific device (owner or collaborator).
     */
    async getDeviceLogs(req, res) {
        try {
            const { auid }                                            = req.params;
            const { eventType, severity, from, to, page, limit }     = req.query;

            const result = await eventLogService.query({
                auid,
                eventTypes: eventType ? eventType.split(',').map(s => s.trim().toUpperCase()) : undefined,
                severities: severity  ? severity.split(',').map(s => s.trim().toUpperCase())  : undefined,
                from,
                to,
                page,
                limit,
            });

            return res.json({
                success: true,
                auid,
                ...result,
            });
        } catch (err) {
            console.error('[EventLog] getDeviceLogs error:', err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
    }

    /**
     * GET /api/devices/:auid/logs/latest
     * Get the last N events for a device (quick widget).
     */
    async getLatest(req, res) {
        try {
            const { auid } = req.params;
            const n        = Math.min(100, parseInt(req.query.n || '20', 10));
            const logs     = await eventLogService.latest(auid, n);
            return res.json({ success: true, auid, logs });
        } catch (err) {
            console.error('[EventLog] getLatest error:', err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
    }

    /**
     * GET /api/devices/logs/my
     * Get logs across all devices owned by the authenticated user.
     */
    async getMyLogs(req, res) {
        try {
            const userId                                          = req.user?.userid || req.user?.id;
            const { eventType, severity, from, to, page, limit } = req.query;

            const result = await eventLogService.query({
                userId,
                eventTypes: eventType ? eventType.split(',').map(s => s.trim().toUpperCase()) : undefined,
                severities: severity  ? severity.split(',').map(s => s.trim().toUpperCase())  : undefined,
                from,
                to,
                page,
                limit,
            });

            return res.json({ success: true, userId, ...result });
        } catch (err) {
            console.error('[EventLog] getMyLogs error:', err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
    }

    /**
     * GET /api/organizations/:orgId/device-logs
     * Get logs across all devices in an organization.
     */
    async getOrgLogs(req, res) {
        try {
            const { orgId }                                       = req.params;
            const { eventType, severity, from, to, page, limit } = req.query;

            const result = await eventLogService.query({
                orgId,
                eventTypes: eventType ? eventType.split(',').map(s => s.trim().toUpperCase()) : undefined,
                severities: severity  ? severity.split(',').map(s => s.trim().toUpperCase())  : undefined,
                from,
                to,
                page,
                limit,
            });

            return res.json({ success: true, orgId, ...result });
        } catch (err) {
            console.error('[EventLog] getOrgLogs error:', err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
    }
}

module.exports = new EventLogController();
