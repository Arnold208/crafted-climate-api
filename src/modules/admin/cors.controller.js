const corsService = require('../../services/cors.service');

class CorsController {

    /**
     * Get current CORS settings
     */
    async getSettings(req, res) {
        try {
            const settings = await corsService.getCorsSettings();
            res.status(200).json({
                success: true,
                data: {
                    enabled: settings.enabled,
                    allowedOrigins: settings.allowedOrigins,
                    allowCredentials: settings.allowCredentials,
                    updatedBy: settings.updatedBy,
                    lastUpdatedAt: settings.lastUpdatedAt
                }
            });
        } catch (error) {
            console.error('[CorsController] Get settings error:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch CORS settings' });
        }
    }

    /**
     * Update CORS settings
     */
    async updateSettings(req, res) {
        try {
            const { enabled, allowedOrigins, allowCredentials } = req.body;
            const adminId = req.user.userid;

            const settings = await corsService.updateCorsSettings({
                enabled,
                allowedOrigins,
                allowCredentials
            }, adminId);

            res.status(200).json({
                success: true,
                message: 'CORS settings updated successfully',
                data: {
                    enabled: settings.enabled,
                    allowedOrigins: settings.allowedOrigins,
                    allowCredentials: settings.allowCredentials
                }
            });
        } catch (error) {
            console.error('[CorsController] Update settings error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Add allowed origin
     */
    async addOrigin(req, res) {
        try {
            const { origin } = req.body;
            const adminId = req.user.userid;

            if (!origin) {
                return res.status(400).json({ success: false, message: 'Origin is required' });
            }

            const settings = await corsService.addAllowedOrigin(origin, adminId);

            res.status(200).json({
                success: true,
                message: `Origin added: ${origin}`,
                data: {
                    allowedOrigins: settings.allowedOrigins
                }
            });
        } catch (error) {
            console.error('[CorsController] Add origin error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Remove allowed origin
     */
    async removeOrigin(req, res) {
        try {
            const { origin } = req.body;
            const adminId = req.user.userid;

            if (!origin) {
                return res.status(400).json({ success: false, message: 'Origin is required' });
            }

            const settings = await corsService.removeAllowedOrigin(origin, adminId);

            res.status(200).json({
                success: true,
                message: `Origin removed: ${origin}`,
                data: {
                    allowedOrigins: settings.allowedOrigins
                }
            });
        } catch (error) {
            console.error('[CorsController] Remove origin error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Toggle CORS enforcement
     */
    async toggleEnforcement(req, res) {
        try {
            const { enabled } = req.body;
            const adminId = req.user.userid;

            if (typeof enabled !== 'boolean') {
                return res.status(400).json({ success: false, message: 'enabled must be a boolean' });
            }

            const settings = await corsService.toggleCorsEnforcement(enabled, adminId);

            res.status(200).json({
                success: true,
                message: `CORS enforcement ${enabled ? 'enabled' : 'disabled'}`,
                data: {
                    enabled: settings.enabled
                }
            });
        } catch (error) {
            console.error('[CorsController] Toggle enforcement error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Get change history
     */
    async getHistory(req, res) {
        try {
            const history = await corsService.getChangeHistory();
            res.status(200).json({
                success: true,
                data: history
            });
        } catch (error) {
            console.error('[CorsController] Get history error:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch change history' });
        }
    }
}

module.exports = new CorsController();
