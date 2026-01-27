/**
 * Organization Management Service Extension
 * Handles name editing, verification, partner workflows, and type changes
 * 
 * 🔒 SECURITY: All methods include input validation and authorization checks
 */

const Organization = require('../../models/organization/organizationModel');
const User = require('../../models/user/userModel');
const CacheService = require('../common/cache.service');
const { validateOrganizationName, validateBusinessDetails, validatePartnerApplication, sanitizeText } = require('../../validators/organizationValidators');
const { hasPermission, hasPlatformPermission } = require('../../constants/organizationPermissions');
const { requiresVerification } = require('../../constants/organizationTypes');
const { getDefaultBenefits } = require('../../constants/partnerTiers');
const emailService = require('./organizationEmail.service');

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

        if (!isPlatformAdmin) {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

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
        await CacheService.invalidate(`org:${orgId}:meta`);

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

        return {
            message: 'Partner application submitted successfully. Awaiting admin review.',
            applicationId: orgId,
            status: 'pending'
        };
    }
}

module.exports = new OrganizationManagementService();
