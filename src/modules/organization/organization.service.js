const { v4: uuidv4 } = require('uuid');
const { nanoid } = require('nanoid');

const User = require('../../models/user/userModel');
const Organization = require('../../models/organization/organizationModel');
const UserSubscription = require('../../models/subscriptions/UserSubscription');
const Plan = require('../../models/subscriptions/Plan');
const RegisteredDevice = require('../../models/devices/registerDevice');
const Deployment = require('../../models/deployment/deploymentModel');
const CacheService = require('../common/cache.service');

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

        return { organizationId };
    }

    async addCollaborator(orgId, email, role) {
        const user = await User.findOne({ email });
        if (!user) throw new Error("User not found");

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

        return { currentOrganizationId: orgId };
    }
}

module.exports = new OrganizationService();
