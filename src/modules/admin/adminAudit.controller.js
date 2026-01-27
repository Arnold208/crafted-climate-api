const adminAuditService = require('../../services/adminAudit.service');

class AdminAuditController {

    async getAllLogs(req, res) {
        try {
            const filters = {
                action: req.query.action,
                userid: req.query.userid,
                startDate: req.query.startDate,
                endDate: req.query.endDate
            };

            const pagination = {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 100
            };

            const result = await adminAuditService.getAllLogs(filters, pagination);

            res.status(200).json({
                success: true,
                data: result.logs,
                pagination: result.pagination,
                message: result.message
            });
        } catch (error) {
            console.error('[AdminAuditController] Get all logs error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async getUserLogs(req, res) {
        try {
            const { userid } = req.params;
            const dateRange = {
                startDate: req.query.startDate,
                endDate: req.query.endDate
            };

            const result = await adminAuditService.getUserLogs(userid, dateRange);

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[AdminAuditController] Get user logs error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async getOrganizationLogs(req, res) {
        try {
            const { orgId } = req.params;
            const dateRange = {
                startDate: req.query.startDate,
                endDate: req.query.endDate
            };

            const result = await adminAuditService.getOrganizationLogs(orgId, dateRange);

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[AdminAuditController] Get org logs error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async exportLogs(req, res) {
        try {
            const filters = {
                action: req.body.action,
                userid: req.body.userid,
                startDate: req.body.startDate,
                endDate: req.body.endDate
            };

            const format = req.body.format || 'json';

            const result = await adminAuditService.exportLogs(filters, format);

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[AdminAuditController] Export logs error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = new AdminAuditController();
