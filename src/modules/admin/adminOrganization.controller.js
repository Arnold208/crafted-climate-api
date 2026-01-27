const adminOrgService = require('../../services/adminOrganization.service');

class AdminOrganizationController {

    async listOrganizations(req, res) {
        try {
            const filters = {
                search: req.query.search,
                organizationType: req.query.type,
                verified: req.query.verified === 'true' ? true : req.query.verified === 'false' ? false : undefined,
                isPartner: req.query.partner === 'true' ? true : req.query.partner === 'false' ? false : undefined
            };

            const pagination = {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 50
            };

            const result = await adminOrgService.listAllOrganizations(filters, pagination);

            res.status(200).json({
                success: true,
                data: result.organizations,
                pagination: result.pagination
            });
        } catch (error) {
            console.error('[AdminOrgController] List error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async getOrganizationDetails(req, res) {
        try {
            const { orgId } = req.params;
            const org = await adminOrgService.getOrganizationDetails(orgId);

            res.status(200).json({
                success: true,
                data: org
            });
        } catch (error) {
            console.error('[AdminOrgController] Get details error:', error);
            res.status(404).json({ success: false, message: error.message });
        }
    }

    async deleteOrganization(req, res) {
        try {
            const { orgId } = req.params;
            const adminId = req.user.userid;

            const result = await adminOrgService.deleteOrganization(orgId, adminId);

            res.status(200).json(result);
        } catch (error) {
            console.error('[AdminOrgController] Delete error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    async suspendOrganization(req, res) {
        try {
            const { orgId } = req.params;
            const { reason } = req.body;
            const adminId = req.user.userid;

            if (!reason) {
                return res.status(400).json({ success: false, message: 'Reason is required' });
            }

            const result = await adminOrgService.suspendOrganization(orgId, reason, adminId);

            res.status(200).json(result);
        } catch (error) {
            console.error('[AdminOrgController] Suspend error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    async getMembers(req, res) {
        try {
            const { orgId } = req.params;
            const result = await adminOrgService.getOrganizationMembers(orgId);

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[AdminOrgController] Get members error:', error);
            res.status(404).json({ success: false, message: error.message });
        }
    }

    async transferOwnership(req, res) {
        try {
            const { orgId } = req.params;
            const { newOwnerId } = req.body;
            const adminId = req.user.userid;

            if (!newOwnerId) {
                return res.status(400).json({ success: false, message: 'New owner ID is required' });
            }

            const result = await adminOrgService.transferOwnership(orgId, newOwnerId, adminId);

            res.status(200).json(result);
        } catch (error) {
            console.error('[AdminOrgController] Transfer ownership error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }
}

module.exports = new AdminOrganizationController();
