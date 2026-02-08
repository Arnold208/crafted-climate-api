const { v4: uuidv4 } = require('uuid');
const { nanoid } = require('nanoid');

const User = require('../../models/user/userModel');
const Organization = require('../../models/organization/organizationModel');
const UserSubscription = require('../../models/subscriptions/UserSubscription');
const Plan = require('../../models/subscriptions/Plan');
const RegisteredDevice = require('../../models/devices/registerDevice');
const Deployment = require('../../models/deployment/deploymentModel');
const CacheService = require('../common/cache.service');
const { createAuditLog } = require('../../utils/auditLogger');

class OrganizationService {

    async createOrganization({ name, description, ownerUserId, planName, createdBy, organizationType }) {
        // Unique Check (ignoring deleted)
        const existingOrg = await Organization.findOne({
            name: new RegExp(`^${name}$`, "i"),
            deletedAt: null
        });
        if (existingOrg) throw new Error("Organization name already exists");

        // Owner Check
        const owner = await User.findOne({ userid: ownerUserId });
        if (!owner) throw new Error("Owner user not found");

        const organizationId = `org-${uuidv4()}`;

        const org = new Organization({
            organizationId,
            name,
            description,
            organizationType: organizationType || "personal", // Default to personal if not provided
            collaborators: [{
                userid: ownerUserId,
                role: "org-admin",
                permissions: [],
                joinedAt: new Date()
            }],
            planType: "enterprise",
            createdBy
        });

        await org.save();

        // Add to owner
        await User.updateOne(
            { userid: ownerUserId },
            { $addToSet: { organization: organizationId } }
        );

        // Assign Plan
        const plan = await Plan.findOne({
            name: planName || "enterprise",
            isActive: true
        });

        if (plan) {
            await UserSubscription.create({
                subscriptionId: uuidv4(),
                userid: ownerUserId,
                organizationId,
                subscriptionScope: "organization",
                planId: plan.planId,
                billingCycle: "monthly",
                status: "active"
            });

            await Organization.updateOne(
                { organizationId },
                {
                    $set: {
                        "subscription.planId": plan.planId,
                        "subscription.status": "active",
                        "subscription.subscribedAt": new Date()
                    }
                }
            );
        }

        // AUDIT LOG
        await createAuditLog({
            action: 'ORG_CREATE',
            userid: createdBy, // Fixed: using createdBy instead of ownerUserId (usually same)
            organizationId,
            details: { name, planName },
            ipAddress: null
        });

        return { organizationId };
    }

    async addCollaborator(orgId, email, role) {
        const user = await User.findOne({ email });
        if (!user) throw new Error("User not found");
        if (user.deletedAt) throw new Error("Cannot add a suspended user to an organization");

        const org = await Organization.findOne({ organizationId: orgId, deletedAt: null });
        if (!org) throw new Error("Organization not found");

        // Check if user is already a member
        const isMember = org.collaborators.some(c => c.userid === user.userid);
        if (isMember) throw new Error("User already in organization");

        // SUBSCRIPTION ENFORCEMENT: Max Members
        const subscription = await UserSubscription.findOne({ organizationId: orgId, status: 'active' });
        if (subscription) {
            const plan = await Plan.findOne({ planId: subscription.planId });
            // If plan exists and has a limit (null means unlimited)
            if (plan && plan.features && plan.features.maxMembers != null) {
                if (org.collaborators.length >= plan.features.maxMembers) {
                    throw new Error(`Upgrade required: Your plan allows max ${plan.features.maxMembers} members.`);
                }
            }
        }

        org.collaborators.push({
            userid: user.userid,
            role,
            joinedAt: new Date(),
            permissions: []
        });

        await org.save();

        await User.updateOne(
            { userid: user.userid },
            { $addToSet: { organization: orgId } }
        );

        // INVALIDATION
        await CacheService.invalidate(`org:${orgId}:meta`);
        await CacheService.invalidate(`user:${user.userid}:orgs`);

        // AUDIT LOG
        await createAuditLog({
            action: 'ORG_ADD_COLLABORATOR',
            userid: user.userid, // Note: Tracks the ADDED user. Usually we want the actor? 
            // BUT service methods don't always get 'actorId'. 
            // Ideally we pass 'actorId' to service. 
            // For now, logging the affected user + org is useful.
            organizationId: orgId,
            details: { role, addedUserEmail: email },
            ipAddress: null
        });

        return { message: "User added", userid: user.userid, organization: org };
    }

    async removeCollaborator(orgId, userid) {
        const org = await Organization.findOne({ organizationId: orgId, deletedAt: null });
        if (!org) throw new Error("Organization not found");

        // Remove from Org
        org.collaborators = org.collaborators.filter(c => c.userid !== userid);
        await org.save();

        // Remove from User
        await User.updateOne(
            { userid },
            { $pull: { organization: orgId } }
        );

        // Integrity Cleanup: Deployments
        const deployments = await Deployment.find({ organizationId: orgId });
        const deploymentIds = deployments.map(d => d.deploymentid);

        if (deploymentIds.length > 0) {
            await Deployment.updateMany(
                { organizationId: orgId },
                { $pull: { collaborators: { userid } } }
            );
            await User.updateOne(
                { userid },
                { $pullAll: { deployments: deploymentIds } }
            );
        }

        // Integrity Cleanup: Devices
        await RegisteredDevice.updateMany(
            { organizationId: orgId },
            { $pull: { collaborators: { userid } } }
        );

        // INVALIDATION
        await CacheService.invalidate(`org:${orgId}:meta`);
        await CacheService.invalidate(`user:${userid}:orgs`);

        // AUDIT LOG
        await createAuditLog({
            action: 'ORG_REMOVE_COLLABORATOR',
            userid: userid, // The removed user
            organizationId: orgId,
            details: { removedUserId: userid },
            ipAddress: null
        });

        return { message: "User removed and cleaned up" };
    }

    async updateCollaboratorRole(orgId, userid, newRole) {
        const org = await Organization.findOne({ organizationId: orgId, deletedAt: null });
        if (!org) throw new Error("Organization not found");

        const member = org.collaborators.find(c => c.userid === userid);
        if (!member) throw new Error("User not in organization");

        member.role = newRole;
        member.role = newRole;
        await org.save();

        // INVALIDATION
        await CacheService.invalidate(`org:${orgId}:meta`);

        // AUDIT LOG
        await createAuditLog({
            action: 'ORG_UPDATE_MEMBER_ROLE',
            userid: userid,
            organizationId: orgId,
            details: { newRole },
            ipAddress: null
        });

        return { message: "Role updated" };
    }

    async getUserOrganizations(userid) {
        // OPTIMIZATION: Cache User's Org List (1h)
        // Invalidation: add/remove collaborator
        return await CacheService.getOrSet(`user:${userid}:orgs`, async () => {
            const user = await User.findOne({ userid });
            if (!user) throw new Error("User not found");

            return await Organization.find({
                organizationId: { $in: user.organization },
                deletedAt: null
            });
        }, 3600);
    }

    async getOrganizationInfo(orgId) {
        // OPTIMIZATION: Cache Org Info (1h) matches verifyOrgMembership cache
        const cacheKey = `org:${orgId}:meta`;
        const org = await CacheService.getOrSet(cacheKey, async () => {
            return await Organization.findOne({ organizationId: orgId, deletedAt: null });
        }, 3600);

        if (!org) throw new Error("Organization not found");
        return org;
    }

    async switchOrganization(userid, orgId) {
        const user = await User.findOne({ userid });
        if (!user.organization.includes(orgId)) {
            throw new Error("User does not belong to organization"); // Forbidden
        }

        user.currentOrganizationId = orgId;
        await user.save();

        // AUDIT LOG (Optional, can be noisy)
        await createAuditLog({
            action: 'USER_SWITCH_ORG',
            userid: userid,
            organizationId: orgId,
            details: { previousOrg: user.currentOrganizationId },
            ipAddress: null
        });

        return { currentOrganizationId: orgId };
    }

    /**
     * 🗑️ DISSOLVE ORGANIZATION (Soft Delete)
     * Allows Org Admin to delete their organization.
     */
    async dissolveOrganization(orgId, userid) {
        const org = await Organization.findOne({ organizationId: orgId, deletedAt: null });
        if (!org) throw new Error("Organization not found");

        // Authorization: Must be Org Admin
        const member = org.collaborators.find(c => c.userid === userid);
        if (!member || member.role !== 'org-admin') {
            throw new Error("Unauthorized. Only Organization Admins can dissolve the organization.");
        }

        // Logic: Soft Delete + Suspend
        org.deletedAt = new Date();
        org.suspended = true;
        org.suspensionReason = "Dissolved by Organization Admin";

        // Cancel Subscription
        if (org.subscription) {
            org.subscription.status = 'cancelled';

            // Also update UserSubscription model if exists
            await UserSubscription.updateMany(
                { organizationId: orgId, status: 'active' },
                { $set: { status: 'cancelled', canceledAt: new Date() } }
            );
        }

        await org.save();

        // Remove from all users' lists (Optional, or keep for history?)
        // Usually we keep the link but filter by deletedAt in queries.
        // But for 'switchOrganization' safety, we might want to remove strict dependency.
        // For now, let's keep the link so they can see "Deleted Org" in history if we ever build that. 
        // But invalidating cache is crucial.

        await CacheService.invalidate(`org:${orgId}:meta`);
        // We can't easily invalidate ALL users' org lists without scanning. 
        // But individually they will refresh on next fetch.

        await createAuditLog({
            action: 'ORG_DISSOLVE',
            userid: userid,
            organizationId: orgId,
            details: { reason: "User requested dissolution" },
            ipAddress: null
        });

        return { message: "Organization dissolved successfully. It is now suspended and scheduled for deletion.", organizationId: orgId };
    }
}

module.exports = new OrganizationService();
