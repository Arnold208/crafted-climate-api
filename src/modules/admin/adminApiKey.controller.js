const apiKeyService = require('../../services/apiKey.service');
const ApiKey = require('../../models/apikey/ApiKey');

/**
 * Admin API Key Controller
 * Platform admin management of all API keys
 */
class AdminApiKeyController {

    /**
     * List all API keys across platform
     */
    async listAllApiKeys(req, res) {
        try {
            const filters = {
                organizationId: req.query.organizationId,
                status: req.query.status
            };

            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const skip = (page - 1) * limit;

            const query = {};
            if (filters.organizationId) query.organizationId = filters.organizationId;
            if (filters.status) query.status = filters.status;

            const [keys, total] = await Promise.all([
                ApiKey.find(query)
                    .select('-keyHash')
                    .skip(skip)
                    .limit(limit)
                    .sort({ createdAt: -1 })
                    .lean(),
                ApiKey.countDocuments(query)
            ]);

            res.status(200).json({
                success: true,
                data: keys,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            console.error('[AdminApiKeyController] List error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Get API key details
     */
    async getApiKeyDetails(req, res) {
        try {
            const { keyId } = req.params;

            const apiKey = await ApiKey.findOne({ keyId })
                .select('-keyHash')
                .lean();

            if (!apiKey) {
                return res.status(404).json({
                    success: false,
                    message: 'API key not found'
                });
            }

            // Get usage stats
            const usageStats = await apiKeyService.getUsageStats(keyId, {
                startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
                endDate: new Date()
            });

            res.status(200).json({
                success: true,
                data: {
                    ...apiKey,
                    usage: usageStats
                }
            });
        } catch (error) {
            console.error('[AdminApiKeyController] Get details error:', error);
            res.status(404).json({ success: false, message: error.message });
        }
    }

    /**
     * Revoke API key
     */
    async revokeApiKey(req, res) {
        try {
            const { keyId } = req.params;
            const { reason } = req.body;
            const adminId = req.user.userid;

            if (!reason) {
                return res.status(400).json({
                    success: false,
                    message: 'Revocation reason is required'
                });
            }

            const result = await apiKeyService.revokeApiKey(keyId, reason, adminId);

            res.status(200).json(result);
        } catch (error) {
            console.error('[AdminApiKeyController] Revoke error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Suspend API key
     */
    async suspendApiKey(req, res) {
        try {
            const { keyId } = req.params;
            const adminId = req.user.userid;

            const result = await apiKeyService.suspendApiKey(keyId, adminId);

            res.status(200).json(result);
        } catch (error) {
            console.error('[AdminApiKeyController] Suspend error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Restore suspended API key
     */
    async restoreApiKey(req, res) {
        try {
            const { keyId } = req.params;
            const adminId = req.user.userid;

            const result = await apiKeyService.restoreApiKey(keyId, adminId);

            res.status(200).json(result);
        } catch (error) {
            console.error('[AdminApiKeyController] Restore error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Get platform-wide usage statistics
     */
    async getPlatformUsageStats(req, res) {
        try {
            const dateRange = {
                startDate: req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                endDate: req.query.endDate || new Date()
            };

            const [totalKeys, activeKeys, totalRequests] = await Promise.all([
                ApiKey.countDocuments(),
                ApiKey.countDocuments({ status: 'active' }),
                require('../../models/apikey/ApiKeyUsage').countDocuments({
                    timestamp: {
                        $gte: new Date(dateRange.startDate),
                        $lte: new Date(dateRange.endDate)
                    }
                })
            ]);

            res.status(200).json({
                success: true,
                data: {
                    totalKeys,
                    activeKeys,
                    totalRequests,
                    dateRange
                }
            });
        } catch (error) {
            console.error('[AdminApiKeyController] Usage stats error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = new AdminApiKeyController();
