const Organization = require('../models/organization/organizationModel');
const User = require('../models/user/userModel');
const RegisterDevice = require('../models/devices/registerDevice');
const { createAuditLog } = require('../utils/auditLogger');

/**
 * Admin Organization Extended Service
 * Additional platform admin operations for organizations
 */
class AdminOrganizationExtendedService {

    /**
     * List all organizations
     */
    async listAllOrganizations(filters = {}, pagination = {}) {
        const {
            search,
            organizationType,
            verified,
            isPartner
        } = filters;

        const {
            page = 1,
            limit = 50
        } = pagination;

        const skip = (page - 1) * limit;

        const query = {};

        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        if (organizationType) {
            query.organizationType = organizationType;
        }

        if (verified !== undefined) {
            query.verified = verified;
        }

        if (isPartner !== undefined) {
            query.isPartner = isPartner;
        }

        const [organizations, total] = await Promise.all([
            Organization.find(query)
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 })
                .lean(),
            Organization.countDocuments(query)
        ]);

        // Get member counts
        for (let org of organizations) {
            const memberCount = await User.countDocuments({
                organization: org.organizationId
            });
            org.memberCount = memberCount;
        }

        return {
            organizations,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Get organization details
     */
    async getOrganizationDetails(orgId) {
        const org = await Organization.findOne({ organizationId: orgId }).lean();

        if (!org) {
            throw new Error('Organization not found');
        }

        // Get members
        const members = await User.find({ organization: orgId })
            .select('userid email username role')
            .lean();

        // Get device count
        const deviceCount = await RegisterDevice.countDocuments({ organizationId: orgId });

        return {
            ...org,
            members,
            memberCount: members.length,
            deviceCount
        };
    }

    /**
     * Delete organization
     */
    async deleteOrganization(orgId, adminId) {
        const org = await Organization.findOne({ organizationId: orgId });
        if (!org) {
            throw new Error('Organization not found');
        }

        // Check if it's a personal org
        if (org.organizationType === 'personal') {
            throw new Error('Cannot delete personal organizations');
        }

        // Check for members
        const memberCount = await User.countDocuments({ organization: orgId });
        if (memberCount > 0) {
            throw new Error(`Cannot delete organization with ${memberCount} members. Remove members first.`);
        }

        // Check for devices
        const deviceCount = await RegisterDevice.countDocuments({ organizationId: orgId });
        if (deviceCount > 0) {
            throw new Error(`Cannot delete organization with ${deviceCount} devices. Remove devices first.`);
        }

        await Organization.deleteOne({ organizationId: orgId });

        // Audit log
        await createAuditLog({
            action: 'ADMIN_DELETE_ORGANIZATION',
            userid: adminId,
            details: {
                organizationId: orgId,
                name: org.name
            },
            ipAddress: null
        });

        return {
            success: true,
            message: 'Organization deleted successfully'
        };
    }

    /**
     * Suspend organization
     */
    async suspendOrganization(orgId, reason, adminId) {
        const org = await Organization.findOne({ organizationId: orgId });
        if (!org) {
            throw new Error('Organization not found');
        }

        if (org.organizationType === 'personal') {
            throw new Error('Cannot suspend personal organizations');
        }

        org.suspended = true;
        org.suspensionReason = reason;
        org.suspendedAt = new Date();
        await org.save();

        // Audit log
        await createAuditLog({
            action: 'ADMIN_SUSPEND_ORGANIZATION',
            userid: adminId,
            details: {
                organizationId: orgId,
                reason
            },
            ipAddress: null
        });

        return {
            success: true,
            message: 'Organization suspended successfully'
        };
    }

    /**
     * Get organization members
     */
    async getOrganizationMembers(orgId) {
        const org = await Organization.findOne({ organizationId: orgId });
        if (!org) {
            throw new Error('Organization not found');
        }

        const members = await User.find({ organization: orgId })
            .select('userid email username firstName lastName role createdAt')
            .lean();

        return {
            organizationId: orgId,
            organizationName: org.name,
            members,
            count: members.length
        };
    }

    /**
     * Transfer organization ownership
     */
    async transferOwnership(orgId, newOwnerId, adminId) {
        const org = await Organization.findOne({ organizationId: orgId });
        if (!org) {
            throw new Error('Organization not found');
        }

        const newOwner = await User.findOne({ userid: newOwnerId });
        if (!newOwner) {
            throw new Error('New owner not found');
        }

        // Check if new owner is a member
        if (!newOwner.organization.includes(orgId)) {
            throw new Error('New owner must be a member of the organization');
        }

        const oldOwnerId = org.owner;
        org.owner = newOwnerId;
        await org.save();

        // Audit log
        await createAuditLog({
            action: 'ADMIN_TRANSFER_ORGANIZATION_OWNERSHIP',
            userid: adminId,
            details: {
                organizationId: orgId,
                oldOwnerId,
                newOwnerId
            },
            ipAddress: null
        });

        return {
            success: true,
            message: 'Ownership transferred successfully',
            organization: org
        };
    }
}

module.exports = new AdminOrganizationExtendedService();
