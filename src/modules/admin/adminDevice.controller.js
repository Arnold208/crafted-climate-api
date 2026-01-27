const adminDeviceService = require('../../services/adminDevice.service');

class AdminDeviceController {

    async listDevices(req, res) {
        try {
            const filters = {
                search: req.query.search,
                organizationId: req.query.organizationId,
                status: req.query.status,
                type: req.query.type
            };

            const pagination = {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 50
            };

            const result = await adminDeviceService.listAllDevices(filters, pagination);

            res.status(200).json({
                success: true,
                data: result.devices,
                pagination: result.pagination
            });
        } catch (error) {
            console.error('[AdminDeviceController] List error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async getStatistics(req, res) {
        try {
            const stats = await adminDeviceService.getDeviceStatistics();

            res.status(200).json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('[AdminDeviceController] Stats error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async removeDevice(req, res) {
        try {
            const { deviceId } = req.params;
            const adminId = req.user.userid;

            const result = await adminDeviceService.removeDevice(deviceId, adminId);

            res.status(200).json(result);
        } catch (error) {
            console.error('[AdminDeviceController] Remove error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    async getOfflineDevices(req, res) {
        try {
            const hours = parseInt(req.query.hours) || 24;
            const result = await adminDeviceService.getOfflineDevices(hours);

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[AdminDeviceController] Offline devices error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async reassignDevice(req, res) {
        try {
            const { deviceId } = req.params;
            const { organizationId } = req.body;
            const adminId = req.user.userid;

            if (!organizationId) {
                return res.status(400).json({ success: false, message: 'Organization ID is required' });
            }

            const result = await adminDeviceService.reassignDevice(deviceId, organizationId, adminId);

            res.status(200).json(result);
        } catch (error) {
            console.error('[AdminDeviceController] Reassign error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }
}

module.exports = new AdminDeviceController();
