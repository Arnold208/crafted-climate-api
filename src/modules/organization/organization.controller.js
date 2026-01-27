const organizationService = require('./organization.service');
const analyticsService = require('../analytics/analytics.service');

class OrganizationController {

    async getDashboard(req, res) {
        try {
            const { organizationId } = req.params; // Changed to match route param usually :orgId or :organizationId check route
            // Route uses :orgId usually? let's check input
            const orgId = req.params.orgId || req.params.organizationId;
            const stats = await analyticsService.getOrgOverview(orgId);
            res.json(stats);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async create(req, res) {
        try {
            const { name, description, ownerUserId, planName, organizationType } = req.body;
            if (!name || !ownerUserId) {
                return res.status(400).json({ message: "Missing required fields: name, ownerUserId" });
            }

            // In strict mode, check if req.user.userid is admin or authorized to create for others
            // For now passing createdBy as req.user.userid
            const result = await organizationService.createOrganization({
                name, description, ownerUserId, planName, organizationType, createdBy: req.user.userid
            });

            return res.status(201).json({ message: "Organization created successfully", ...result });

        } catch (error) {
            console.error(error);
            if (error.message.includes("exists")) return res.status(409).json({ message: error.message });
            if (error.message.includes("not found")) return res.status(404).json({ message: error.message });
            return res.status(500).json({ message: error.message });
        }
    }

    async addCollaborator(req, res) {
        try {
            const { orgId } = req.params;
            const { email, role } = req.body;
            const result = await organizationService.addCollaborator(orgId, email, role);
            return res.status(200).json(result);
        } catch (error) {
            if (error.message.includes("already")) return res.status(400).json({ message: error.message });
            if (error.message.includes("not found")) return res.status(404).json({ message: error.message });
            return res.status(500).json({ message: error.message });
        }
    }

    async removeCollaborator(req, res) {
        try {
            const { orgId, userid } = req.params;
            const result = await organizationService.removeCollaborator(orgId, userid);
            return res.status(200).json(result);
        } catch (error) {
            if (error.message.includes("not found")) return res.status(404).json({ message: error.message });
            return res.status(500).json({ message: error.message });
        }
    }

    async updateCollaboratorRole(req, res) {
        try {
            const { orgId } = req.params;
            const { userid, newRole } = req.body; // Check inconsistent usage: body vs payload. Route def uses body.
            // Note: Route previously used 'role' or 'newRole'. Standardize to 'role' or 'newRole'.
            // Swagger used 'newRole'. 
            const roleToUpdate = newRole || req.body.role;

            const result = await organizationService.updateCollaboratorRole(orgId, userid, roleToUpdate);
            return res.status(200).json(result);
        } catch (error) {
            if (error.message.includes("not found")) return res.status(404).json({ message: error.message });
            return res.status(500).json({ message: error.message });
        }
    }

    async getMyOrganizations(req, res) {
        try {
            const orgs = await organizationService.getUserOrganizations(req.user.userid);
            return res.status(200).json(orgs);
        } catch (error) {
            return res.status(500).json({ message: error.message });
        }
    }

    async getOrganizationInfo(req, res) {
        try {
            const { orgId } = req.params;
            const org = await organizationService.getOrganizationInfo(orgId);
            return res.status(200).json(org);
        } catch (error) {
            if (error.message.includes("not found")) return res.status(404).json({ message: error.message });
            return res.status(500).json({ message: error.message });
        }
    }

    async selectOrganization(req, res) {
        try {
            const { organizationId } = req.body;
            const result = await organizationService.switchOrganization(req.user.userid, organizationId);
            return res.status(200).json({ message: "Active organization switched", ...result });
        } catch (error) {
            if (error.message.includes("belong")) return res.status(403).json({ message: error.message });
            return res.status(500).json({ message: error.message });
        }
    }
}

module.exports = new OrganizationController();
