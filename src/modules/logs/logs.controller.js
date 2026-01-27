const logsService = require('./logs.service');

class LogsController {
    async getOrgLogs(req, res) {
        try {
            const { orgId } = req.params;
            let { limit = 50, offset = 0, startTime, endTime } = req.query;

            // Security checks
            if (orgId !== req.currentOrgId) return res.status(403).json({ error: 'Denied: Cannot access logs from other organizations' });
            if (req.user.platformRole === 'super-admin') return res.status(403).json({ error: 'Denied: Super-admin cannot access organization logs' });

            limit = Math.min(parseInt(limit) || 50, 500);
            offset = Math.max(parseInt(offset) || 0, 0);

            const filter = logsService.buildTimeFilter([`PartitionKey eq '${orgId}'`], startTime, endTime);
            const result = await logsService.queryLogs(filter, { limit, offset });

            res.status(200).json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    async getPlatformLogs(req, res) {
        try {
            let { limit = 50, offset = 0, startTime, endTime } = req.query;

            // Security (Role check handled by middleware or here? Route usually has auth check)
            // Route middleware handles `authenticateToken`.
            // Controller handles specific role check.
            const allowedRoles = ['platform-admin', 'admin', 'super-admin'];
            if (!allowedRoles.includes(req.user.platformRole)) {
                return res.status(403).json({ error: 'Denied: Only platform admins can access platform logs' });
            }

            limit = Math.min(parseInt(limit) || 50, 500);
            offset = Math.max(parseInt(offset) || 0, 0);

            const filter = logsService.buildTimeFilter([`PartitionKey eq 'platform'`], startTime, endTime);
            const result = await logsService.queryLogs(filter, { limit, offset });

            res.status(200).json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = new LogsController();
