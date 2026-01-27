/**
 * Organization Management Controller Extension
 * Handles name editing, verification, and partner workflows
 * 
 * 🔒 SECURITY: All endpoints include authentication and authorization
 */

const organizationManagementService = require('./organizationManagement.service');
const adminOrganizationService = require('./adminOrganization.service');

class OrganizationManagementController {

    /**
     * PUT /api/org/:orgId/name
     * Update organization name (2x per 30 days limit, strict)
     */
    async updateOrganizationName(req, res) {
        try {
            const { orgId } = req.params;
            const { newName, reason } = req.body;
            const userid = req.user.userid;
            const platformRole = req.user.platformRole || 'user';

            // Validation
            if (!newName || !reason) {
                return res.status(400).json({
                    message: 'newName and reason are required'
                });
            }

            const result = await organizationManagementService.updateOrganizationName(
                orgId,
                newName,
                userid,
                reason,
                platformRole
            );

            return res.status(200).json(result);
        } catch (error) {
            console.error('Update organization name error:', error);

            if (error.message.includes('limit reached')) {
                return res.status(429).json({ message: error.message });
            }
            if (error.message.includes('already exists')) {
                return res.status(409).json({ message: error.message });
            }
            if (error.message.includes('permissions')) {
                return res.status(403).json({ message: error.message });
            }

            return res.status(400).json({ message: error.message });
        }
    }

    /**
     * GET /api/org/:orgId/name-history
     * Get organization name edit history
     */
    async getNameEditHistory(req, res) {
        try {
            const { orgId } = req.params;
            const userid = req.user.userid;

            const history = await organizationManagementService.getNameEditHistory(orgId, userid);

            return res.status(200).json({ history });
        } catch (error) {
            console.error('Get name history error:', error);

            if (error.message.includes('not a member')) {
                return res.status(403).json({ message: error.message });
            }

            return res.status(400).json({ message: error.message });
        }
    }

    /**
     * POST /api/org/:orgId/type/request
     * Request organization type change
     */
    async requestTypeChange(req, res) {
        try {
            const { orgId } = req.params;
            const { requestedType, justification, supportingDocuments } = req.body;
            const userid = req.user.userid;

            if (!requestedType || !justification || !supportingDocuments) {
                return res.status(400).json({
                    message: 'requestedType, justification, and supportingDocuments are required'
                });
            }

            const result = await organizationManagementService.requestOrganizationTypeChange(
                orgId,
                requestedType,
                justification,
                supportingDocuments,
                userid
            );

            return res.status(201).json(result);
        } catch (error) {
            console.error('Request type change error:', error);

            if (error.message.includes('permissions')) {
                return res.status(403).json({ message: error.message });
            }
            if (error.message.includes('already pending')) {
                return res.status(409).json({ message: error.message });
            }

            return res.status(400).json({ message: error.message });
        }
    }

    /**
     * POST /api/org/:orgId/verify
     * Submit business verification
     */
    async submitVerification(req, res) {
        try {
            const { orgId } = req.params;
            const { businessDetails, documents } = req.body;
            const userid = req.user.userid;

            if (!businessDetails || !documents) {
                return res.status(400).json({
                    message: 'businessDetails and documents are required'
                });
            }

            const result = await organizationManagementService.submitBusinessVerification(
                orgId,
                businessDetails,
                documents,
                userid
            );

            return res.status(201).json(result);
        } catch (error) {
            console.error('Submit verification error:', error);

            if (error.message.includes('permissions')) {
                return res.status(403).json({ message: error.message });
            }
            if (error.message.includes('already')) {
                return res.status(409).json({ message: error.message });
            }

            return res.status(400).json({ message: error.message });
        }
    }

    /**
     * POST /api/org/:orgId/partner/apply
     * Apply for partner status
     */
    async applyForPartner(req, res) {
        try {
            const { orgId } = req.params;
            const { requestedTier, businessCase, expectedDeviceCount, expectedRevenue } = req.body;
            const userid = req.user.userid;

            if (!requestedTier || !businessCase || !expectedDeviceCount) {
                return res.status(400).json({
                    message: 'requestedTier, businessCase, and expectedDeviceCount are required'
                });
            }

            const result = await organizationManagementService.applyForPartnerStatus(
                orgId,
                requestedTier,
                businessCase,
                expectedDeviceCount,
                expectedRevenue || 0,
                userid
            );

            return res.status(201).json(result);
        } catch (error) {
            console.error('Apply for partner error:', error);

            if (error.message.includes('permissions')) {
                return res.status(403).json({ message: error.message });
            }
            if (error.message.includes('already')) {
                return res.status(409).json({ message: error.message });
            }

            return res.status(400).json({ message: error.message });
        }
    }

    // ========================================
    // ADMIN ENDPOINTS
    // ========================================

    /**
     * GET /api/admin/type-change-requests
     * Get all type change requests (admin only)
     */
    async getTypeChangeRequests(req, res) {
        try {
            const platformRole = req.user.platformRole;
            const { status } = req.query;

            const requests = await adminOrganizationService.getTypeChangeRequests(platformRole, status);

            return res.status(200).json({ requests });
        } catch (error) {
            console.error('Get type change requests error:', error);

            if (error.message.includes('Unauthorized')) {
                return res.status(403).json({ message: error.message });
            }

            return res.status(500).json({ message: error.message });
        }
    }

    /**
     * PUT /api/admin/type-change-requests/:orgId/approve
     * Approve type change request (admin only)
     */
    async approveTypeChange(req, res) {
        try {
            const { orgId } = req.params;
            const adminUserid = req.user.userid;
            const platformRole = req.user.platformRole;

            const result = await adminOrganizationService.approveTypeChangeRequest(
                orgId,
                adminUserid,
                platformRole
            );

            return res.status(200).json(result);
        } catch (error) {
            console.error('Approve type change error:', error);

            if (error.message.includes('Unauthorized')) {
                return res.status(403).json({ message: error.message });
            }

            return res.status(400).json({ message: error.message });
        }
    }

    /**
     * PUT /api/admin/type-change-requests/:orgId/reject
     * Reject type change request (admin only)
     */
    async rejectTypeChange(req, res) {
        try {
            const { orgId } = req.params;
            const { reason } = req.body;
            const adminUserid = req.user.userid;
            const platformRole = req.user.platformRole;

            if (!reason) {
                return res.status(400).json({ message: 'Rejection reason is required' });
            }

            const result = await adminOrganizationService.rejectTypeChangeRequest(
                orgId,
                adminUserid,
                reason,
                platformRole
            );

            return res.status(200).json(result);
        } catch (error) {
            console.error('Reject type change error:', error);

            if (error.message.includes('Unauthorized')) {
                return res.status(403).json({ message: error.message });
            }

            return res.status(400).json({ message: error.message });
        }
    }

    /**
     * GET /api/admin/verifications
     * Get all verification requests (admin only)
     */
    async getVerificationRequests(req, res) {
        try {
            const platformRole = req.user.platformRole;
            const { status } = req.query;

            const requests = await adminOrganizationService.getVerificationRequests(platformRole, status);

            return res.status(200).json({ requests });
        } catch (error) {
            console.error('Get verification requests error:', error);

            if (error.message.includes('Unauthorized')) {
                return res.status(403).json({ message: error.message });
            }

            return res.status(500).json({ message: error.message });
        }
    }

    /**
     * PUT /api/admin/verifications/:orgId/approve
     * Approve verification (admin only)
     */
    async approveVerification(req, res) {
        try {
            const { orgId } = req.params;
            const adminUserid = req.user.userid;
            const platformRole = req.user.platformRole;

            const result = await adminOrganizationService.approveVerification(
                orgId,
                adminUserid,
                platformRole
            );

            return res.status(200).json(result);
        } catch (error) {
            console.error('Approve verification error:', error);

            if (error.message.includes('Unauthorized')) {
                return res.status(403).json({ message: error.message });
            }

            return res.status(400).json({ message: error.message });
        }
    }

    /**
     * PUT /api/admin/verifications/:orgId/reject
     * Reject verification (admin only)
     */
    async rejectVerification(req, res) {
        try {
            const { orgId } = req.params;
            const { reason } = req.body;
            const adminUserid = req.user.userid;
            const platformRole = req.user.platformRole;

            if (!reason) {
                return res.status(400).json({ message: 'Rejection reason is required' });
            }

            const result = await adminOrganizationService.rejectVerification(
                orgId,
                adminUserid,
                reason,
                platformRole
            );

            return res.status(200).json(result);
        } catch (error) {
            console.error('Reject verification error:', error);

            if (error.message.includes('Unauthorized')) {
                return res.status(403).json({ message: error.message });
            }

            return res.status(400).json({ message: error.message });
        }
    }

    /**
     * GET /api/admin/partners/applications
     * Get all partner applications (admin only)
     */
    async getPartnerApplications(req, res) {
        try {
            const platformRole = req.user.platformRole;
            const { status } = req.query;

            const applications = await adminOrganizationService.getPartnerApplications(platformRole, status);

            return res.status(200).json({ applications });
        } catch (error) {
            console.error('Get partner applications error:', error);

            if (error.message.includes('Unauthorized')) {
                return res.status(403).json({ message: error.message });
            }

            return res.status(500).json({ message: error.message });
        }
    }

    /**
     * PUT /api/admin/partners/:orgId/approve
     * Approve partner application (admin only)
     */
    async approvePartner(req, res) {
        try {
            const { orgId } = req.params;
            const { approvedTier } = req.body;
            const adminUserid = req.user.userid;
            const platformRole = req.user.platformRole;

            if (!approvedTier) {
                return res.status(400).json({ message: 'Approved tier is required' });
            }

            const result = await adminOrganizationService.approvePartnerApplication(
                orgId,
                adminUserid,
                approvedTier,
                platformRole
            );

            return res.status(200).json(result);
        } catch (error) {
            console.error('Approve partner error:', error);

            if (error.message.includes('Unauthorized')) {
                return res.status(403).json({ message: error.message });
            }

            return res.status(400).json({ message: error.message });
        }
    }

    /**
     * PUT /api/admin/partners/:orgId/reject
     * Reject partner application (admin only)
     */
    async rejectPartner(req, res) {
        try {
            const { orgId } = req.params;
            const { reason } = req.body;
            const adminUserid = req.user.userid;
            const platformRole = req.user.platformRole;

            if (!reason) {
                return res.status(400).json({ message: 'Rejection reason is required' });
            }

            const result = await adminOrganizationService.rejectPartnerApplication(
                orgId,
                adminUserid,
                reason,
                platformRole
            );

            return res.status(200).json(result);
        } catch (error) {
            console.error('Reject partner error:', error);

            if (error.message.includes('Unauthorized')) {
                return res.status(403).json({ message: error.message });
            }

            return res.status(400).json({ message: error.message });
        }
    }

    /**
     * DELETE /api/admin/partners/:orgId/revoke
     * Revoke partner status (admin only)
     */
    async revokePartner(req, res) {
        try {
            const { orgId } = req.params;
            const { reason } = req.body;
            const adminUserid = req.user.userid;
            const platformRole = req.user.platformRole;

            if (!reason) {
                return res.status(400).json({ message: 'Revocation reason is required' });
            }

            const result = await adminOrganizationService.revokePartnerStatus(
                orgId,
                adminUserid,
                reason,
                platformRole
            );

            return res.status(200).json(result);
        } catch (error) {
            console.error('Revoke partner error:', error);

            if (error.message.includes('Unauthorized')) {
                return res.status(403).json({ message: error.message });
            }

            return res.status(400).json({ message: error.message });
        }
    }
}

module.exports = new OrganizationManagementController();
