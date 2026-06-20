const organizationService = require('./organization.service');
const analyticsService = require('../analytics/analytics.service');
// MRV field visibility: strip MRV fields from org responses for non-MRV users
const { applyOrgMRVVisibility } = require('../../services/mrv/mrvFieldVisibility');

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
            const { orgId } = req.params;
            const { userid, email } = req.body; // Accept email from body
            // Legacy path param support? 
            // If body is empty but param exists (for DELETE /:userid)
            const paramUserId = req.params.userid;

            const identifier = {};
            if (userid) identifier.userid = userid;
            else if (email) identifier.email = email;
            else if (paramUserId) identifier.userid = paramUserId;
            else return res.status(400).json({ message: "User ID or Email is required" });

            const result = await organizationService.removeCollaborator(orgId, identifier);
            return res.status(200).json(result);
        } catch (error) {
            if (error.message.includes("not found")) return res.status(404).json({ message: error.message });
            if (error.message.includes("not a member")) return res.status(404).json({ message: error.message });
            return res.status(500).json({ message: error.message });
        }
    }

    async updateCollaboratorRole(req, res) {
        try {
            const { orgId } = req.params;
            const { userid, email, newRole, role } = req.body;

            const roleToUpdate = newRole || role;
            if (!roleToUpdate) return res.status(400).json({ message: "New role is required" });

            const identifier = {};
            if (userid) identifier.userid = userid;
            else if (email) identifier.email = email;
            else return res.status(400).json({ message: "User ID or Email is required" });

            const result = await organizationService.updateCollaboratorRole(orgId, identifier, roleToUpdate);
            return res.status(200).json(result);
        } catch (error) {
            if (error.message.includes("not found")) return res.status(404).json({ message: error.message });
            return res.status(500).json({ message: error.message });
        }
    }

    async getMembers(req, res) {
        try {
            const { orgId } = req.params;
            const members = await organizationService.getOrganizationMembers(orgId);
            return res.status(200).json(members);
        } catch (error) {
            if (error.message.includes("not found")) return res.status(404).json({ message: error.message });
            return res.status(500).json({ message: error.message });
        }
    }

    async getMyOrganizations(req, res) {
        try {
            const orgs = await organizationService.getUserOrganizations(req.user.userid);
            // Strip MRV fields for users without MRV project access
            const sanitized = applyOrgMRVVisibility(orgs, req.user, null, req);
            return res.status(200).json(sanitized);
        } catch (error) {
            return res.status(500).json({ message: error.message });
        }
    }

    async getOrganizationInfo(req, res) {
        try {
            const { orgId } = req.params;
            const org = await organizationService.getOrganizationInfo(orgId);
            // Strip MRV fields for users without MRV project access
            const sanitized = applyOrgMRVVisibility(
                org?.toObject ? org.toObject() : org,
                req.user, orgId, req
            );
            return res.status(200).json(sanitized);
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

    async dissolve(req, res) {
        try {
            const { orgId } = req.params;
            const result = await organizationService.dissolveOrganization(orgId, req.user.userid);
            return res.status(200).json(result);
        } catch (error) {
            if (error.message.includes("Unauthorized")) return res.status(403).json({ message: error.message });
            if (error.message.includes("not found")) return res.status(404).json({ message: error.message });
            return res.status(500).json({ message: error.message });
        }
    }
}

module.exports = new OrganizationController();
