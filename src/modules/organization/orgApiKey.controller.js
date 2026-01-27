const apiKeyService = require('../../services/apiKey.service');

/**
 * Organization API Key Controller
 * Self-service API key management for organizations
 */
class OrgApiKeyController {

    /**
     * Generate new API key for organization
     */
    async generateApiKey(req, res) {
        try {
            const { orgId } = req.params;
            const userid = req.user.userid;

            // Verify user belongs to organization
            if (!req.user.organization.includes(orgId)) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have access to this organization'
                });
            }

            const { name, permissions, rateLimit, expiresAt, rotationSchedule, allowedIPs } = req.body;

            if (!name) {
                return res.status(400).json({
                    success: false,
                    message: 'API key name is required'
                });
            }

            const result = await apiKeyService.generateApiKey(orgId, {
                name,
                permissions,
                rateLimit,
                expiresAt,
                rotationSchedule,
                allowedIPs
            }, userid);

            res.status(201).json({
                success: true,
                message: 'API key generated successfully',
                data: result
            });
        } catch (error) {
            console.error('[OrgApiKeyController] Generate error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * List organization's API keys
     */
    async listOrgApiKeys(req, res) {
        try {
            const { orgId } = req.params;

            // Verify user belongs to organization
            if (!req.user.organization.includes(orgId)) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have access to this organization'
                });
            }

            const filters = {
                status: req.query.status
            };

            const keys = await apiKeyService.listApiKeys(orgId, filters);

            res.status(200).json({
                success: true,
                data: keys
            });
        } catch (error) {
            console.error('[OrgApiKeyController] List error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Rotate API key
     */
    async rotateApiKey(req, res) {
        try {
            const { orgId, keyId } = req.params;
            const userid = req.user.userid;

            // Verify user belongs to organization
            if (!req.user.organization.includes(orgId)) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have access to this organization'
                });
            }

            const result = await apiKeyService.rotateApiKey(keyId, userid);

            res.status(200).json({
                success: true,
                message: 'API key rotated successfully',
                data: result
            });
        } catch (error) {
            console.error('[OrgApiKeyController] Rotate error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Revoke API key
     */
    async revokeApiKey(req, res) {
        try {
            const { orgId, keyId } = req.params;
            const { reason } = req.body;
            const userid = req.user.userid;

            // Verify user belongs to organization
            if (!req.user.organization.includes(orgId)) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have access to this organization'
                });
            }

            const result = await apiKeyService.revokeApiKey(keyId, reason || 'Revoked by user', userid);

            res.status(200).json(result);
        } catch (error) {
            console.error('[OrgApiKeyController] Revoke error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Get API key usage statistics
     */
    async getKeyUsageStats(req, res) {
        try {
            const { orgId, keyId } = req.params;

            // Verify user belongs to organization
            if (!req.user.organization.includes(orgId)) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have access to this organization'
                });
            }

            const dateRange = {
                startDate: req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                endDate: req.query.endDate || new Date()
            };

            const stats = await apiKeyService.getUsageStats(keyId, dateRange);

            res.status(200).json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('[OrgApiKeyController] Usage stats error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = new OrgApiKeyController();
