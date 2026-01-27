const systemConfigService = require('../../services/systemConfig.service');

class SystemConfigController {

    async getConfig(req, res) {
        try {
            const config = await systemConfigService.getConfig();
            res.status(200).json({
                success: true,
                data: config
            });
        } catch (error) {
            console.error('[SystemConfigController] Get config error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async updateFeatures(req, res) {
        try {
            const { features } = req.body;
            const adminId = req.user.userid;

            if (!features) {
                return res.status(400).json({ success: false, message: 'Features object is required' });
            }

            const config = await systemConfigService.updateFeatures(features, adminId);

            res.status(200).json({
                success: true,
                message: 'Feature flags updated successfully',
                data: config.features
            });
        } catch (error) {
            console.error('[SystemConfigController] Update features error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    async updateRateLimits(req, res) {
        try {
            const { rateLimits } = req.body;
            const adminId = req.user.userid;

            if (!rateLimits) {
                return res.status(400).json({ success: false, message: 'Rate limits object is required' });
            }

            const config = await systemConfigService.updateRateLimits(rateLimits, adminId);

            res.status(200).json({
                success: true,
                message: 'Rate limits updated successfully',
                data: config.rateLimits
            });
        } catch (error) {
            console.error('[SystemConfigController] Update rate limits error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    async toggleMaintenance(req, res) {
        try {
            const { enabled, message } = req.body;
            const adminId = req.user.userid;

            if (typeof enabled !== 'boolean') {
                return res.status(400).json({ success: false, message: 'enabled must be a boolean' });
            }

            const config = await systemConfigService.toggleMaintenance(enabled, message, adminId);

            res.status(200).json({
                success: true,
                message: `Maintenance mode ${enabled ? 'enabled' : 'disabled'}`,
                data: config.maintenance
            });
        } catch (error) {
            console.error('[SystemConfigController] Toggle maintenance error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    async getChangeHistory(req, res) {
        try {
            const history = await systemConfigService.getChangeHistory();
            res.status(200).json({
                success: true,
                data: history
            });
        } catch (error) {
            console.error('[SystemConfigController] Get history error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = new SystemConfigController();
