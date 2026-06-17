/**
 * Organization Management Service Extension
 * Handles name editing, verification, partner workflows, and type changes
 * 
 * 🔒 SECURITY: All methods include input validation and authorization checks
 */

const Organization = require('../../models/organization/organizationModel');
const User = require('../../models/user/userModel');
const Plan = require('../../models/subscriptions/Plan');
const UserSubscription = require('../../models/subscriptions/UserSubscription');
const CacheService = require('../common/cache.service');
const { validateOrganizationName, validateBusinessDetails, validatePartnerApplication, sanitizeText } = require('../../validators/organizationValidators');
const { hasPermission, hasPlatformPermission } = require('../../constants/organizationPermissions');
const { requiresVerification } = require('../../constants/organizationTypes');
const { getDefaultBenefits } = require('../../constants/partnerTiers');
const emailService = require('./organizationEmail.service');
const OrganizationRequest = require('../../models/organization/organizationRequestModel');
const { v4: uuidv4 } = require('uuid');
const { getDefaultPermissions } = require('../../utils/permissions');
const OrganizationService = require('./organization.service');

class OrganizationManagementService {

    /**
     * 🔒 UPDATE ORGANIZATION NAME (2x per 30 days limit, strict)
     * Platform admins can bypass the limit
     * 
     * @param {string} orgId - Organization ID
     * @param {string} newName - New organization name
     * @param {string} userid - User making the change
     * @param {string} reason - Justification for name change (required)
     * @param {string} platformRole - User's platform role (for admin bypass)
     * @returns {Promise<Object>}
     */
    async updateOrganizationName(orgId, newName, userid, reason, platformRole = 'user') {
        // 🔒 SECURITY: Validate and sanitize name
        const validation = validateOrganizationName(newName);
        if (!validation.isValid) {
            throw new Error(validation.error);
        }

        const sanitizedName = validation.sanitized;

        // Fetch organization
        const org = await Organization.findOne({ organizationId: orgId, deletedAt: null });
        if (!org) throw new Error('Organization not found');

        // 🔒 AUTHORIZATION: Check if user is org-admin
        const member = org.collaborators.find(c => c.userid === userid);
        if (!member) throw new Error('User is not a member of this organization');

        if (!hasPermission(member.role, 'org:update:name')) {
            throw new Error('Insufficient permissions. Only org-admins can change organization name');
        }

        // Check if name is already taken (case-insensitive)
        const existingOrg = await Organization.findOne({
            organizationId: { $ne: orgId },
            name: new RegExp(`^${sanitizedName}$`, 'i'),
            deletedAt: null
        });
        if (existingOrg) {
            throw new Error('Organization name already exists');
        }

        // 🔒 RATE LIMITING: Check 2x per 30 days limit (strict)
        const isPlatformAdmin = hasPlatformPermission(platformRole, 'platform:orgs:manage');

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        if (!isPlatformAdmin) {

            const recentEdits = org.nameEditHistory.filter(edit =>
                new Date(edit.editedAt) >= thirtyDaysAgo
            );

            if (recentEdits.length >= 2) {
                const oldestEdit = recentEdits[0];
                const daysUntilAllowed = Math.ceil((new Date(oldestEdit.editedAt).getTime() + (30 * 24 * 60 * 60 * 1000) - Date.now()) / (24 * 60 * 60 * 1000));
                throw new Error(`Name edit limit reached. You can edit again in ${daysUntilAllowed} days. (2 edits per 30 days)`);
            }
        }

        // 🔒 SECURITY: Require justification
        if (!reason || reason.trim().length < 10) {
            throw new Error('Reason for name change is required (minimum 10 characters)');
        }

        const sanitizedReason = sanitizeText(reason, 500);

        // Update name and log history
        const oldName = org.name;
        org.name = sanitizedName;
        org.lastNameEditAt = new Date();
        org.nameEditHistory.push({
            oldName,
            newName: sanitizedName,
            editedBy: userid,
            editedAt: new Date(),
            reason: sanitizedReason
        });

        await org.save();

        // 🔒 CACHE INVALIDATION
        await OrganizationService.invalidateOrgCache(orgId);

        return {
            message: 'Organization name updated successfully',
            oldName,
            newName: sanitizedName,
            editsRemaining: isPlatformAdmin ? 'unlimited' : (2 - (org.nameEditHistory.filter(e => new Date(e.editedAt) >= thirtyDaysAgo).length))
        };
    }

    /**
     * 📝 GET NAME EDIT HISTORY
     * 
     * @param {string} orgId - Organization ID
     * @param {string} userid - User requesting history
     * @returns {Promise<Array>}
     */
    async getNameEditHistory(orgId, userid) {
        const org = await Organization.findOne({ organizationId: orgId, deletedAt: null });
        if (!org) throw new Error('Organization not found');

        // Check membership
        const member = org.collaborators.find(c => c.userid === userid);
        if (!member) throw new Error('User is not a member of this organization');

        return org.nameEditHistory.map(edit => ({
            oldName: edit.oldName,
            newName: edit.newName,
            editedBy: edit.editedBy,
            editedAt: edit.editedAt,
            reason: edit.reason
        }));
    }

    /**
     * 🏢 REQUEST ORGANIZATION TYPE CHANGE
     * Requires justification + supporting documents + admin approval
     * 
     * @param {string} orgId - Organization ID
     * @param {string} requestedType - Requested organization type
     * @param {string} justification - Why they want to change type
     * @param {Array} supportingDocuments - Array of document objects
     * @param {string} userid - User making the request
     * @returns {Promise<Object>}
     */
    async requestOrganizationTypeChange(orgId, requestedType, justification, supportingDocuments, userid) {
        const org = await Organization.findOne({ organizationId: orgId, deletedAt: null });
        if (!org) throw new Error('Organization not found');

        // Check if user is org-admin
        const member = org.collaborators.find(c => c.userid === userid);
        if (!member || !hasPermission(member.role, 'org:update:type')) {
            throw new Error('Only org-admins can request type changes');
        }

        // Validate requested type
        const validTypes = ['personal', 'business', 'non-profit', 'government', 'education', 'research'];
        if (!validTypes.includes(requestedType)) {
            throw new Error('Invalid organization type');
        }

        // Check if already pending
        if (org.organizationTypeChangeRequest.status === 'pending') {
            throw new Error('A type change request is already pending review');
        }

        // Validate justification
        if (!justification || justification.trim().length < 50) {
            throw new Error('Justification must be at least 50 characters');
        }

        // Validate supporting documents
        if (!supportingDocuments || supportingDocuments.length === 0) {
            throw new Error('At least one supporting document is required');
        }

        org.organizationTypeChangeRequest = {
            status: 'pending',
            requestedType,
            currentType: org.organizationType,
            justification: sanitizeText(justification, 2000),
            requestedBy: userid,
            requestedAt: new Date(),
            supportingDocuments: supportingDocuments.map(doc => ({
                type: doc.type,
                url: doc.url,
                uploadedAt: new Date(),
                uploadedBy: userid
            }))
        };

        await org.save();

        // 📧 Send email notification
        try {
            const user = await User.findOne({ userid });
            if (user && user.email) {
                await emailService.sendTypeChangeRequestSubmitted(org.name, user.email, requestedType);
            }
        } catch (emailError) {
            console.error('Email notification failed:', emailError);
            // Don't fail the request if email fails
        }

        return {
            message: 'Type change request submitted successfully. Awaiting admin review.',
            requestId: orgId,
            status: 'pending'
        };
    }

    /**
     * ✅ SUBMIT BUSINESS VERIFICATION
     * Requires business license AND incorporation certificate
     * 
     * @param {string} orgId - Organization ID
     * @param {Object} businessDetails - Business details
     * @param {Array} documents - Verification documents
     * @param {string} userid - User submitting verification
     * @returns {Promise<Object>}
     */
    async submitBusinessVerification(orgId, businessDetails, documents, userid) {
        const org = await Organization.findOne({ organizationId: orgId, deletedAt: null });
        if (!org) throw new Error('Organization not found');

        // Check if user is org-admin
        const member = org.collaborators.find(c => c.userid === userid);
        if (!member || !hasPermission(member.role, 'org:verification:submit')) {
            throw new Error('Only org-admins can submit verification');
        }

        // Check if org type requires verification
        if (!requiresVerification(org.organizationType)) {
            throw new Error('This organization type does not require verification');
        }

        // Check if already verified
        if (org.businessVerification.status === 'verified') {
            throw new Error('Organization is already verified');
        }

        // Check if already pending
        if (org.businessVerification.status === 'pending') {
            throw new Error('Verification is already pending review');
        }

        // Validate business details
        const validation = validateBusinessDetails(businessDetails);
        if (!validation.isValid) {
            throw new Error(`Invalid business details: ${validation.errors.join(', ')}`);
        }

        // Validate documents: Require business_license AND incorporation_cert
        const hasBusinessLicense = documents.some(d => d.type === 'business_license');
        const hasIncorporationCert = documents.some(d => d.type === 'incorporation_cert');

        if (!hasBusinessLicense || !hasIncorporationCert) {
            throw new Error('Both business license and incorporation certificate are required');
        }

        org.businessVerification = {
            status: 'pending',
            submittedAt: new Date(),
            businessDetails: {
                legalName: sanitizeText(businessDetails.legalName, 200),
                registrationNumber: sanitizeText(businessDetails.registrationNumber, 100),
                taxId: sanitizeText(businessDetails.taxId, 100),
                country: sanitizeText(businessDetails.country, 100),
                industry: sanitizeText(businessDetails.industry, 100),
                website: sanitizeText(businessDetails.website, 200),
                address: sanitizeText(businessDetails.address, 300)
            },
            documents: documents.map(doc => ({
                type: doc.type,
                url: doc.url,
                uploadedAt: new Date(),
                uploadedBy: userid
            }))
        };

        await org.save();

        // 📧 Send email notification
        try {
            const user = await User.findOne({ userid });
            if (user && user.email) {
                await emailService.sendVerificationSubmitted(org.name, user.email);
            }
        } catch (emailError) {
            console.error('Email notification failed:', emailError);
        }

        // 🔒 CACHE INVALIDATION
        await OrganizationService.invalidateOrgCache(orgId);

        return {
            message: 'Business verification submitted successfully. Awaiting admin review.',
            verificationId: orgId,
            status: 'pending'
        };
    }

    /**
     * 🤝 APPLY FOR PARTNER STATUS
     * 
     * @param {string} orgId - Organization ID
     * @param {string} requestedTier - Requested partner tier
     * @param {string} businessCase - Why they want to be a partner
     * @param {number} expectedDeviceCount - Expected device count
     * @param {number} expectedRevenue - Expected revenue
     * @param {string} userid - User applying
     * @returns {Promise<Object>}
     */
    async applyForPartnerStatus(orgId, requestedTier, businessCase, expectedDeviceCount, expectedRevenue, userid) {
        const org = await Organization.findOne({ organizationId: orgId, deletedAt: null });
        if (!org) throw new Error('Organization not found');

        // Check if user is org-admin
        const member = org.collaborators.find(c => c.userid === userid);
        if (!member || !hasPermission(member.role, 'org:partner:apply')) {
            throw new Error('Only org-admins can apply for partner status');
        }

        // Check if already a partner
        if (org.partnerStatus.isPartner) {
            throw new Error('Organization is already a partner');
        }

        // Check if already pending
        if (org.partnerApplication.status === 'pending') {
            throw new Error('Partner application is already pending review');
        }

        // Validate application data
        const validation = validatePartnerApplication({
            requestedTier,
            businessCase,
            expectedDeviceCount
        });

        if (!validation.isValid) {
            throw new Error(`Invalid application: ${validation.errors.join(', ')}`);
        }

        org.partnerApplication = {
            status: 'pending',
            appliedAt: new Date(),
            requestedTier,
            businessCase: sanitizeText(businessCase, 2000),
            expectedDeviceCount,
            expectedRevenue: expectedRevenue || 0
        };

        await org.save();

        // 📧 Send email notification
        try {
            const user = await User.findOne({ userid });
            if (user && user.email) {
                await emailService.sendPartnerApplicationSubmitted(org.name, user.email, requestedTier);
            }
        } catch (emailError) {
            console.error('Email notification failed:', emailError);
        }

        // 🔒 CACHE INVALIDATION
        await OrganizationService.invalidateOrgCache(orgId);

        return {
            message: 'Partner application submitted successfully. Awaiting admin review.',
            applicationId: orgId,
            status: 'pending'
        };
    }


    /**
     * 🚀 REQUEST TO CREATE NEW ORGANIZATION
     * Logic for User to request a new verified organization
     */
    /**
     * 🔒 VALIDATE UNIQUENESS (PRE-UPLOAD CHECK)
     */
    async validateCreationRequestUniqueness(userId, name) {
        if (!name) throw new Error("Organization name is required");

        const existingRequest = await OrganizationRequest.findOne({
            requesterUserId: userId,
            status: "pending",
            proposedName: new RegExp(`^${name}$`, 'i')
        });
        if (existingRequest) throw new Error("You already have a pending request for this organization name.");

        const existingOrg = await Organization.findOne({
            name: new RegExp(`^${name}$`, 'i'),
            deletedAt: null
        });
        if (existingOrg) throw new Error("Organization name is already taken. Please choose a different name.");

        return true;
    }

    /**
     * 🚀 REQUEST TO CREATE NEW ORGANIZATION
     * Logic for User to request a new verified organization
     * Supports both pre-processed requests (from multipart controller) and standard JSON
     */
    async createCreationRequest(userId, data, isPreProcessed = false) {
        let { name, type, description, businessDetails, documents, requestId, planId, billingCycle } = data;
        billingCycle = billingCycle || 'monthly';

        // Validation
        if (!name || name.length < 3) throw new Error("Organization name is required and must be at least 3 chars");
        if (!["business", "non-profit", "government", "education", "research"].includes(type)) {
            throw new Error("Invalid organization type. Personal organizations do not require approval.");
        }

        if (!documents || documents.length === 0) throw new Error("At least one supporting document is required.");

        // If not pre-processed, do the uniqueness checks here
        if (!isPreProcessed) {
            await this.validateCreationRequestUniqueness(userId, name);
            requestId = `req-${uuidv4()}`;
            documents = documents.map(d => ({ ...d, uploadedBy: userId }));
        }

        // Find plan and price
        let planToUse;
        if (planId) {
            planToUse = await Plan.findOne({ planId, isActive: true });
            if (!planToUse) throw new Error("Requested plan not found or inactive");
        } else {
            planToUse = await Plan.findOne({ name: 'enterprise', isActive: true });
            if (!planToUse) {
                planToUse = await Plan.findOne({ isActive: true }).sort({ priceMonthly: -1 }); // Fallback to most premium plan
            }
        }
        if (!planToUse) throw new Error("No active subscription plan found in the system");

        const price = billingCycle === 'yearly' ? planToUse.priceYearly : planToUse.priceMonthly;
        const amountInPesewas = Math.round(price * 100);

        const request = new OrganizationRequest({
            requestId: requestId || `req-${uuidv4()}`,
            requesterUserId: userId,
            proposedName: name,
            proposedType: type,
            description,
            businessDetails,
            documents: documents,
            planId: planToUse.planId,
            billingCycle,
            status: "payment_pending",
            paymentStatus: "pending"
        });

        let checkoutUrl = null;
        if (amountInPesewas > 0) {
            const user = await User.findOne({ userid: userId });
            if (!user) throw new Error("User not found");

            const paystackService = require('../../services/paystackService');
            const paymentInit = await paystackService.initializeTransaction(user.email, amountInPesewas, {
                requestId: request.requestId,
                planId: planToUse.planId,
                billingCycle,
                userId
            });

            request.paymentReference = paymentInit.reference;
            checkoutUrl = paymentInit.authorization_url;
        } else {
            // Free plan or price is 0
            request.status = "pending"; // Directly moves to pending approval
            request.paymentStatus = "success";
            request.pricePaid = 0;
        }

        await request.save();

        // TODO: Send Email to Admin (Notification)

        return {
            request,
            checkoutUrl
        };
    }

    /**
     * 💳 RETRY PAYMENT FOR CREATION REQUEST
     */
    async retryPayment(requestId, userId) {
        const request = await OrganizationRequest.findOne({ requestId });
        if (!request) throw new Error("Request not found");
        if (request.requesterUserId !== userId) throw new Error("Unauthorized. Only the requester can retry payment.");
        if (request.paymentStatus === 'success') throw new Error("Payment already successful");

        let planToUse = await Plan.findOne({ planId: request.planId });
        if (!planToUse) {
            planToUse = await Plan.findOne({ name: 'enterprise', isActive: true });
        }
        if (!planToUse) throw new Error("Plan not found");

        const price = request.billingCycle === 'yearly' ? planToUse.priceYearly : planToUse.priceMonthly;
        const amountInPesewas = Math.round(price * 100);

        if (amountInPesewas === 0) {
            request.status = "pending";
            request.paymentStatus = "success";
            request.pricePaid = 0;
            await request.save();
            return { request, checkoutUrl: null };
        }

        const user = await User.findOne({ userid: userId });
        if (!user) throw new Error("User not found");

        const paystackService = require('../../services/paystackService');
        const paymentInit = await paystackService.initializeTransaction(user.email, amountInPesewas, {
            requestId: request.requestId,
            planId: planToUse.planId,
            billingCycle: request.billingCycle,
            userId
        });

        request.paymentReference = paymentInit.reference;
        request.paymentStatus = 'pending'; // Reset payment status to pending
        await request.save();

        return {
            request,
            checkoutUrl: paymentInit.authorization_url
        };
    }

    /**
     * 📋 GET CREATION REQUESTS (ADMIN)
     */
    async getCreationRequests(platformRole, status = 'pending') {
        if (!hasPlatformPermission(platformRole, 'platform:orgs:manage')) {
            throw new Error('Unauthorized. Platform Admin access required.');
        }

        const query = status === 'all' ? {} : { status };
        return await OrganizationRequest.find(query).sort({ requestedAt: -1 });
    }

    /**
     * 🔍 GET SPECIFIC CREATION REQUEST (ADMIN)
     */
    async getCreationRequestById(requestId, platformRole) {
        if (!hasPlatformPermission(platformRole, 'platform:orgs:manage')) {
            throw new Error('Unauthorized. Platform Admin access required.');
        }

        const request = await OrganizationRequest.findOne({ requestId });
        if (!request) throw new Error("Request not found");

        return request;
    }

    /**
     * ✅ APPROVE CREATION REQUEST (ADMIN)
     * Creates the Organization and verifies it immediately.
     */
    async approveCreationRequest(requestId, adminUserId, platformRole) {
        if (!hasPlatformPermission(platformRole, 'platform:orgs:manage')) {
            throw new Error('Unauthorized. Platform Admin access required.');
        }

        const request = await OrganizationRequest.findOne({ requestId });
        if (!request) throw new Error("Request not found");
        if (request.status !== "pending") throw new Error(`Request is already ${request.status}`);

        const orgId = `org-${uuidv4()}`;

        // 1. Create Organization (Verified Business)
        const newOrg = new Organization({
            organizationId: orgId,
            name: request.proposedName,
            description: request.description,
            organizationType: request.proposedType,
            planType: "enterprise", // Structure is Enterprise (Multi-user)
            createdBy: request.requesterUserId,

            // Auto-Verify Business Status
            businessVerification: {
                status: "verified",
                submittedAt: request.requestedAt,
                verifiedAt: new Date(),
                verifiedBy: adminUserId,
                businessDetails: request.businessDetails,
                documents: request.documents
            },

            // Add Requester as Org-Admin
            collaborators: [{
                userid: request.requesterUserId,
                role: "org-admin",
                permissions: [],
                addedAt: new Date()
            }]
        });

        // 1b. Assign the requested Plan (or fallback to enterprise)
        let planToAssign;
        if (request.planId) {
            planToAssign = await Plan.findOne({ planId: request.planId });
        }
        if (!planToAssign) {
            planToAssign = await Plan.findOne({ name: 'enterprise', isActive: true });
        }
        if (!planToAssign) {
            planToAssign = await Plan.findOne({ $or: [{ name: 'free' }, { name: 'starter' }], isActive: true });
        }

        if (planToAssign) {
            // Create Subscription Record
            await UserSubscription.create({
                subscriptionId: uuidv4(),
                userid: request.requesterUserId,
                organizationId: orgId,
                subscriptionScope: "organization",
                planId: planToAssign.planId,
                billingCycle: request.billingCycle || "monthly",
                status: "active"
            });

            // Embed in Org
            newOrg.subscription = {
                planId: planToAssign.planId,
                status: "active",
                subscribedAt: new Date()
            };
        } else {
            console.warn(`[OrgMgmt] No active plan found for new organization ${orgId}`);
        }

        await newOrg.save();

        // 2. Add User to Org (Update User model)
        await User.updateOne(
            { userid: request.requesterUserId },
            {
                $addToSet: { organization: orgId },
                $set: { currentOrganizationId: orgId } // Switch checks user context usually
            }
        );

        // 3. Update Request Status
        request.status = "approved";
        request.reviewedBy = adminUserId;
        request.reviewedAt = new Date();
        request.createdOrganizationId = orgId;
        await request.save();

        // 4. Send Email to User
        const user = await User.findOne({ userid: request.requesterUserId });
        if (user) {
            await emailService.sendOrganizationApproved(user.email, newOrg.name);
        }

        // 🔒 CACHE INVALIDATION
        await OrganizationService.invalidateOrgCache(orgId);

        return { message: "Organization created and verified successfully", organization: newOrg };
    }

    /**
     * ❌ REJECT CREATION REQUEST
     */
    async rejectCreationRequest(requestId, adminUserId, reason, platformRole) {
        if (!hasPlatformPermission(platformRole, 'platform:orgs:manage')) {
            throw new Error('Unauthorized. Platform Admin access required.');
        }

        const request = await OrganizationRequest.findOne({ requestId });
        if (!request) throw new Error("Request not found");
        if (request.status !== "pending") throw new Error(`Request is already ${request.status}`);

        request.status = "rejected";
        request.rejectionReason = reason;
        request.reviewedBy = adminUserId;
        request.reviewedAt = new Date();
        await request.save();

        // Send Email
        const user = await User.findOne({ userid: request.requesterUserId });
        if (user) {
            await emailService.sendOrganizationRejected(user.email, request.proposedName, reason);
        }

        return { message: "Request rejected" };
    }

    async getUserCreationRequests(userId) {
        return await OrganizationRequest.find({ requesterUserId: userId }).sort({ requestedAt: -1 });
    }

    async getUserCreationRequestById(requestId, userId) {
        const request = await OrganizationRequest.findOne({ requestId });
        if (!request) throw new Error("Request not found");
        if (request.requesterUserId !== userId) throw new Error("Unauthorized access to organization request");
        return request;
    }
}

module.exports = new OrganizationManagementService();
