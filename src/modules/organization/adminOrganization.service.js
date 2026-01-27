/**
 * Admin Organization Management Service
 * Platform admin-only methods for reviewing and approving requests
 * 
 * 🔒 SECURITY: All methods require platform admin role
 */

const Organization = require('../../models/organization/organizationModel');
const User = require('../../models/user/userModel');
const { hasPlatformPermission } = require('../../constants/organizationPermissions');
const { getDefaultBenefits } = require('../../constants/partnerTiers');
const CacheService = require('../common/cache.service');
const emailService = require('./organizationEmail.service');

class AdminOrganizationService {

    /**
     * 🔒 VERIFY PLATFORM ADMIN
     * Helper method to check if user is platform admin
     */
    _verifyPlatformAdmin(platformRole) {
        if (!hasPlatformPermission(platformRole, 'platform:orgs:manage')) {
            throw new Error('Unauthorized. Platform admin access required.');
        }
    }

    /**
     * 📋 GET ALL TYPE CHANGE REQUESTS
     * 
     * @param {string} platformRole - User's platform role
     * @param {string} status - Filter by status (optional)
     * @returns {Promise<Array>}
     */
    async getTypeChangeRequests(platformRole, status = 'pending') {
        this._verifyPlatformAdmin(platformRole);

        const query = { deletedAt: null };
        if (status) {
            query['organizationTypeChangeRequest.status'] = status;
        }

        const orgs = await Organization.find(query).select(
            'organizationId name organizationType organizationTypeChangeRequest'
        );

        return orgs.filter(org => org.organizationTypeChangeRequest.status !== 'none');
    }

    /**
     * ✅ APPROVE TYPE CHANGE REQUEST
     * Applies automatic benefits for non-profits
     * 
     * @param {string} orgId - Organization ID
     * @param {string} adminUserid - Admin userid
     * @param {string} platformRole - Admin's platform role
     * @returns {Promise<Object>}
     */
    async approveTypeChangeRequest(orgId, adminUserid, platformRole) {
        this._verifyPlatformAdmin(platformRole);

        const org = await Organization.findOne({ organizationId: orgId, deletedAt: null });
        if (!org) throw new Error('Organization not found');

        if (org.organizationTypeChangeRequest.status !== 'pending') {
            throw new Error('No pending type change request found');
        }

        const newType = org.organizationTypeChangeRequest.requestedType;

        // Update organization type
        org.organizationType = newType;
        org.organizationTypeChangeRequest.status = 'approved';
        org.organizationTypeChangeRequest.reviewedBy = adminUserid;
        org.organizationTypeChangeRequest.reviewedAt = new Date();

        // 🎁 AUTOMATIC BENEFITS: Apply non-profit discount
        if (newType === 'non-profit' && !org.partnerStatus.isPartner) {
            org.partnerStatus.benefits.discountPercentage = 15; // 15% discount for non-profits
            console.log(`✅ Applied 15% non-profit discount to ${org.name}`);
        }

        await org.save();
        await CacheService.invalidate(`org:${orgId}:meta`);

        // 📧 Send email notification
        try {
            const orgAdmin = org.collaborators.find(c => c.role === 'org-admin');
            if (orgAdmin) {
                const user = await User.findOne({ userid: orgAdmin.userid });
                if (user && user.email) {
                    await emailService.sendTypeChangeApproved(org.name, user.email, newType, newType === 'non-profit');
                }
            }
        } catch (emailError) {
            console.error('Email notification failed:', emailError);
        }

        return {
            message: 'Type change request approved successfully',
            organizationId: orgId,
            newType,
            automaticBenefitsApplied: newType === 'non-profit'
        };
    }

    /**
     * ❌ REJECT TYPE CHANGE REQUEST
     * 
     * @param {string} orgId - Organization ID
     * @param {string} adminUserid - Admin userid
     * @param {string} reason - Rejection reason
     * @param {string} platformRole - Admin's platform role
     * @returns {Promise<Object>}
     */
    async rejectTypeChangeRequest(orgId, adminUserid, reason, platformRole) {
        this._verifyPlatformAdmin(platformRole);

        const org = await Organization.findOne({ organizationId: orgId, deletedAt: null });
        if (!org) throw new Error('Organization not found');

        if (org.organizationTypeChangeRequest.status !== 'pending') {
            throw new Error('No pending type change request found');
        }

        if (!reason || reason.trim().length < 10) {
            throw new Error('Rejection reason is required (minimum 10 characters)');
        }

        org.organizationTypeChangeRequest.status = 'rejected';
        org.organizationTypeChangeRequest.reviewedBy = adminUserid;
        org.organizationTypeChangeRequest.reviewedAt = new Date();
        org.organizationTypeChangeRequest.rejectionReason = reason;

        await org.save();

        // 📧 Send email notification
        try {
            const orgAdmin = org.collaborators.find(c => c.role === 'org-admin');
            if (orgAdmin) {
                const user = await User.findOne({ userid: orgAdmin.userid });
                if (user && user.email) {
                    await emailService.sendTypeChangeRejected(org.name, user.email, reason);
                }
            }
        } catch (emailError) {
            console.error('Email notification failed:', emailError);
        }

        return {
            message: 'Type change request rejected',
            organizationId: orgId,
            reason
        };
    }

    /**
     * 📋 GET ALL VERIFICATION REQUESTS
     * 
     * @param {string} platformRole - User's platform role
     * @param {string} status - Filter by status
     * @returns {Promise<Array>}
     */
    async getVerificationRequests(platformRole, status = 'pending') {
        this._verifyPlatformAdmin(platformRole);

        const query = { deletedAt: null };
        if (status) {
            query['businessVerification.status'] = status;
        }

        const orgs = await Organization.find(query).select(
            'organizationId name organizationType businessVerification'
        );

        return orgs.filter(org => org.businessVerification.status !== 'unverified');
    }

    /**
     * ✅ APPROVE BUSINESS VERIFICATION
     * 
     * @param {string} orgId - Organization ID
     * @param {string} adminUserid - Admin userid
     * @param {string} platformRole - Admin's platform role
     * @returns {Promise<Object>}
     */
    async approveVerification(orgId, adminUserid, platformRole) {
        this._verifyPlatformAdmin(platformRole);

        const org = await Organization.findOne({ organizationId: orgId, deletedAt: null });
        if (!org) throw new Error('Organization not found');

        if (org.businessVerification.status !== 'pending') {
            throw new Error('No pending verification request found');
        }

        org.businessVerification.status = 'verified';
        org.businessVerification.verifiedBy = adminUserid;
        org.businessVerification.verifiedAt = new Date();

        await org.save();
        await CacheService.invalidate(`org:${orgId}:meta`);

        // 📧 Send email notification
        try {
            const orgAdmin = org.collaborators.find(c => c.role === 'org-admin');
            if (orgAdmin) {
                const user = await User.findOne({ userid: orgAdmin.userid });
                if (user && user.email) {
                    await emailService.sendVerificationApproved(org.name, user.email);
                }
            }
        } catch (emailError) {
            console.error('Email notification failed:', emailError);
        }

        return {
            message: 'Business verification approved successfully',
            organizationId: orgId,
            verifiedAt: org.businessVerification.verifiedAt
        };
    }

    /**
     * ❌ REJECT BUSINESS VERIFICATION
     * 
     * @param {string} orgId - Organization ID
     * @param {string} adminUserid - Admin userid
     * @param {string} reason - Rejection reason
     * @param {string} platformRole - Admin's platform role
     * @returns {Promise<Object>}
     */
    async rejectVerification(orgId, adminUserid, reason, platformRole) {
        this._verifyPlatformAdmin(platformRole);

        const org = await Organization.findOne({ organizationId: orgId, deletedAt: null });
        if (!org) throw new Error('Organization not found');

        if (org.businessVerification.status !== 'pending') {
            throw new Error('No pending verification request found');
        }

        if (!reason || reason.trim().length < 10) {
            throw new Error('Rejection reason is required (minimum 10 characters)');
        }

        org.businessVerification.status = 'rejected';
        org.businessVerification.verifiedBy = adminUserid;
        org.businessVerification.verifiedAt = new Date();
        org.businessVerification.rejectionReason = reason;

        await org.save();

        // 📧 Send email notification
        try {
            const orgAdmin = org.collaborators.find(c => c.role === 'org-admin');
            if (orgAdmin) {
                const user = await User.findOne({ userid: orgAdmin.userid });
                if (user && user.email) {
                    await emailService.sendVerificationRejected(org.name, user.email, reason);
                }
            }
        } catch (emailError) {
            console.error('Email notification failed:', emailError);
        }

        return {
            message: 'Business verification rejected',
            organizationId: orgId,
            reason
        };
    }

    /**
     * 📋 GET ALL PARTNER APPLICATIONS
     * 
     * @param {string} platformRole - User's platform role
     * @param {string} status - Filter by status
     * @returns {Promise<Array>}
     */
    async getPartnerApplications(platformRole, status = 'pending') {
        this._verifyPlatformAdmin(platformRole);

        const query = { deletedAt: null };
        if (status) {
            query['partnerApplication.status'] = status;
        }

        const orgs = await Organization.find(query).select(
            'organizationId name organizationType partnerApplication'
        );

        return orgs.filter(org => org.partnerApplication.status !== 'none');
    }

    /**
     * ✅ APPROVE PARTNER APPLICATION
     * Applies default benefits for the tier
     * 
     * @param {string} orgId - Organization ID
     * @param {string} adminUserid - Admin userid
     * @param {string} approvedTier - Approved tier (can differ from requested)
     * @param {string} platformRole - Admin's platform role
     * @returns {Promise<Object>}
     */
    async approvePartnerApplication(orgId, adminUserid, approvedTier, platformRole) {
        this._verifyPlatformAdmin(platformRole);

        const org = await Organization.findOne({ organizationId: orgId, deletedAt: null });
        if (!org) throw new Error('Organization not found');

        if (org.partnerApplication.status !== 'pending') {
            throw new Error('No pending partner application found');
        }

        const validTiers = ['standard', 'premium', 'enterprise'];
        if (!validTiers.includes(approvedTier)) {
            throw new Error('Invalid partner tier');
        }

        // Get default benefits for tier
        const benefits = getDefaultBenefits(approvedTier);

        // Update partner status
        org.partnerStatus = {
            isPartner: true,
            tier: approvedTier,
            approvedAt: new Date(),
            approvedBy: adminUserid,
            expiresAt: null, // No expiration (admin can revoke manually)
            benefits
        };

        // Update application status
        org.partnerApplication.status = 'approved';
        org.partnerApplication.reviewedBy = adminUserid;
        org.partnerApplication.reviewedAt = new Date();

        await org.save();
        await CacheService.invalidate(`org:${orgId}:meta`);

        // 📧 Send email notification
        try {
            const orgAdmin = org.collaborators.find(c => c.role === 'org-admin');
            if (orgAdmin) {
                const user = await User.findOne({ userid: orgAdmin.userid });
                if (user && user.email) {
                    await emailService.sendPartnerApplicationApproved(org.name, user.email, approvedTier, benefits);
                }
            }
        } catch (emailError) {
            console.error('Email notification failed:', emailError);
        }

        return {
            message: 'Partner application approved successfully',
            organizationId: orgId,
            tier: approvedTier,
            benefits
        };
    }

    /**
     * ❌ REJECT PARTNER APPLICATION
     * 
     * @param {string} orgId - Organization ID
     * @param {string} adminUserid - Admin userid
     * @param {string} reason - Rejection reason
     * @param {string} platformRole - Admin's platform role
     * @returns {Promise<Object>}
     */
    async rejectPartnerApplication(orgId, adminUserid, reason, platformRole) {
        this._verifyPlatformAdmin(platformRole);

        const org = await Organization.findOne({ organizationId: orgId, deletedAt: null });
        if (!org) throw new Error('Organization not found');

        if (org.partnerApplication.status !== 'pending') {
            throw new Error('No pending partner application found');
        }

        if (!reason || reason.trim().length < 10) {
            throw new Error('Rejection reason is required (minimum 10 characters)');
        }

        org.partnerApplication.status = 'rejected';
        org.partnerApplication.reviewedBy = adminUserid;
        org.partnerApplication.reviewedAt = new Date();
        org.partnerApplication.rejectionReason = reason;

        await org.save();

        // 📧 Send email notification
        try {
            const orgAdmin = org.collaborators.find(c => c.role === 'org-admin');
            if (orgAdmin) {
                const user = await User.findOne({ userid: orgAdmin.userid });
                if (user && user.email) {
                    await emailService.sendPartnerApplicationRejected(org.name, user.email, reason);
                }
            }
        } catch (emailError) {
            console.error('Email notification failed:', emailError);
        }

        return {
            message: 'Partner application rejected',
            organizationId: orgId,
            reason
        };
    }

    /**
     * 🔄 REVOKE PARTNER STATUS
     * Admin can revoke partner status at any time
     * 
     * @param {string} orgId - Organization ID
     * @param {string} adminUserid - Admin userid
     * @param {string} reason - Revocation reason
     * @param {string} platformRole - Admin's platform role
     * @returns {Promise<Object>}
     */
    async revokePartnerStatus(orgId, adminUserid, reason, platformRole) {
        this._verifyPlatformAdmin(platformRole);

        const org = await Organization.findOne({ organizationId: orgId, deletedAt: null });
        if (!org) throw new Error('Organization not found');

        if (!org.partnerStatus.isPartner) {
            throw new Error('Organization is not a partner');
        }

        // Reset partner status
        org.partnerStatus = {
            isPartner: false,
            tier: 'none',
            approvedAt: null,
            approvedBy: null,
            expiresAt: null,
            benefits: {
                discountPercentage: 0,
                prioritySupport: false,
                dedicatedAccountManager: false,
                customBranding: false,
                apiRateLimitMultiplier: 1,
                freeDevices: 0
            }
        };

        await org.save();
        await CacheService.invalidate(`org:${orgId}:meta`);

        // 📧 Send email notification
        try {
            const orgAdmin = org.collaborators.find(c => c.role === 'org-admin');
            if (orgAdmin) {
                const user = await User.findOne({ userid: orgAdmin.userid });
                if (user && user.email) {
                    await emailService.sendPartnerStatusRevoked(org.name, user.email, reason);
                }
            }
        } catch (emailError) {
            console.error('Email notification failed:', emailError);
        }

        return {
            message: 'Partner status revoked successfully',
            organizationId: orgId,
            reason
        };
    }
}

module.exports = new AdminOrganizationService();
