/**
 * Organization Management Controller Extension
 * Handles name editing, verification, and partner workflows
 * 
 * 🔒 SECURITY: All endpoints include authentication and authorization
 */

const organizationManagementService = require('./organizationManagement.service');
const documentUploadService = require('./documentUpload.service'); // Added import
const { v4: uuidv4 } = require('uuid');
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
    // ORG CREATION REQUESTS (NEW WORKFLOW)
    // ========================================

    /**
     * POST /api/org/request-creation
     * Request a new verified organization
     */
    async requestCreation(req, res) {
        try {
            const userid = req.user.userid;

            // 1. EXTRACT DATA (Multipart fields usually come as strings)
            let { name, type, description, businessDetails, documents, planId, billingCycle } = req.body;

            // Handle businessDetails if sent as string (common in multipart)
            if (typeof businessDetails === 'string') {
                try {
                    businessDetails = JSON.parse(businessDetails);
                } catch (e) {
                    console.warn('[OrgMgmt] businessDetails is not valid JSON, attempting to construct from fields');
                }
            }

            // If still not an object (or parsing failed/was empty), construct from flat fields
            if (!businessDetails || typeof businessDetails !== 'object') {
                businessDetails = {
                    legalName: req.body['businessDetails.legalName'] || req.body.legalName,
                    tin: req.body['businessDetails.tin'] || req.body.tin, // Tax ID
                    businessType: req.body['businessDetails.businessType'] || req.body.businessType,
                    industry: req.body['businessDetails.industry'] || req.body.industry,
                    website: req.body['businessDetails.website'] || req.body.website,
                    location: req.body['businessDetails.location'] || req.body.location,

                    // Nested Address
                    address: {
                        streetAddress: req.body['businessDetails.address.streetAddress'] || req.body.streetAddress,
                        city: req.body['businessDetails.address.city'] || req.body.city,
                        state: req.body['businessDetails.address.state'] || req.body.state,
                        postalCode: req.body['businessDetails.address.postalCode'] || req.body.postalCode,
                        country: req.body['businessDetails.address.country'] || req.body.country,
                        buildingName: req.body['businessDetails.address.buildingName'] || req.body.buildingName,
                        gps: {
                            latitude: req.body['businessDetails.address.gps.latitude'] || req.body.latitude,
                            longitude: req.body['businessDetails.address.gps.longitude'] || req.body.longitude
                        }
                    }
                };
            }

            // 2. NAME UNIQUENESS CHECK (Stop before uploading)
            // Delegate this check to the service helper or do it here. 
            // Ideally we do it here to save bandwidth/time, but service encapsulates logic.
            // We'll call a dedicated validation method first.
            await organizationManagementService.validateCreationRequestUniqueness(userid, name);

            const requestId = `req-${uuidv4()}`;
            const uploadedDocuments = [];

            // 3. HANDLE FILE UPLOADS
            if (req.files && req.files.length > 0) {
                // Upload each file
                for (const file of req.files) {
                    // Determine doc type from fieldname or body map
                    // Client should send fieldname like 'businessCert', 'workplaceImage'
                    const docType = file.fieldname || 'other';

                    const uploadResult = await documentUploadService.uploadCreationRequestDocument(
                        file,
                        requestId,
                        docType,
                        userid
                    );
                    uploadedDocuments.push(uploadResult);
                }
            }

            // 4. SUBMIT REQUEST
            const requestData = {
                requestId,
                name,
                type,
                description,
                businessDetails,
                documents: uploadedDocuments,
                planId,
                billingCycle
            };

            const result = await organizationManagementService.createCreationRequest(userid, requestData, true); // true = skip validation since we did checks/processing
            return res.status(201).json({
                message: "Request submitted successfully",
                request: result.request,
                checkoutUrl: result.checkoutUrl
            });

        } catch (error) {
            console.error('[OrgMgmt] Request Creation Error:', error);
            if (error.message.includes('already taken') || error.message.includes('pending request')) {
                return res.status(409).json({ message: error.message });
            }
            return res.status(400).json({ message: error.message });
        }
    }

    /**
     * POST /api/org/creation-requests/:requestId/retry-payment
     * Retry payment for a pending organization request
     */
    async retryPayment(req, res) {
        try {
            const { requestId } = req.params;
            const userid = req.user.userid;

            const result = await organizationManagementService.retryPayment(requestId, userid);
            return res.status(200).json({
                message: result.checkoutUrl ? "Payment initialized" : "Request approved directly",
                request: result.request,
                checkoutUrl: result.checkoutUrl
            });
        } catch (error) {
            console.error('[OrgMgmt] Retry Payment Error:', error);
            return res.status(400).json({ message: error.message });
        }
    }

    /**
     * GET /api/org/admin/creation-requests
     * List creation requests (Admin Only)
     */
    async listCreationRequests(req, res) {
        try {
            const platformRole = req.user.platformRole;
            const { status } = req.query;
            const requests = await organizationManagementService.getCreationRequests(platformRole, status);
            return res.status(200).json({ success: true, count: requests.length, data: requests });
        } catch (error) {
            if (error.message.includes('Unauthorized')) return res.status(403).json({ message: error.message });
            return res.status(500).json({ message: error.message });
        }
    }

    /**
     * GET /api/org/admin/creation-requests/:requestId
     * Get specific request details
     */
    async getCreationRequest(req, res) {
        try {
            const { requestId } = req.params;
            const platformRole = req.user.platformRole;
            const request = await organizationManagementService.getCreationRequestById(requestId, platformRole);
            return res.status(200).json(request);
        } catch (error) {
            if (error.message.includes('Unauthorized')) return res.status(403).json({ message: error.message });
            if (error.message.includes('not found')) return res.status(404).json({ message: error.message });
            return res.status(400).json({ message: error.message });
        }
    }

    /**
     * PUT /api/org/admin/creation-requests/:requestId/approve
     * Approve creation request -> Creates Org
     */
    async approveCreationRequest(req, res) {
        try {
            const { requestId } = req.params;
            const adminUserId = req.user.userid;
            const platformRole = req.user.platformRole;

            const result = await organizationManagementService.approveCreationRequest(requestId, adminUserId, platformRole);
            return res.status(200).json(result);
        } catch (error) {
            if (error.message.includes('Unauthorized')) return res.status(403).json({ message: error.message });
            if (error.message.includes('not found')) return res.status(404).json({ message: error.message });
            return res.status(400).json({ message: error.message });
        }
    }

    /**
     * PUT /api/org/admin/creation-requests/:requestId/reject
     * Reject creation request
     */
    async rejectCreationRequest(req, res) {
        try {
            const { requestId } = req.params;
            const { reason } = req.body;
            const adminUserId = req.user.userid;
            const platformRole = req.user.platformRole;

            if (!reason) return res.status(400).json({ message: "Rejection reason is required" });

            const result = await organizationManagementService.rejectCreationRequest(requestId, adminUserId, reason, platformRole);
            return res.status(200).json(result);
        } catch (error) {
            if (error.message.includes('Unauthorized')) return res.status(403).json({ message: error.message });
            if (error.message.includes('not found')) return res.status(404).json({ message: error.message });
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
