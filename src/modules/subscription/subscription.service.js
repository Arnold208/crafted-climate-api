const Plan = require('../../models/subscriptions/Plan');
const UserSubscription = require('../../models/subscriptions/UserSubscription');
const getUserPlan = require('../../middleware/subscriptions/getUserPlan');
const { v4: uuidv4 } = require('uuid');
// const CacheService = require('../common/cache.service'); // Replaced by OrganizationService
const OrganizationService = require('../organization/organization.service');
const Organization = require('../../models/organization/organizationModel');

class SubscriptionService {
    // --- Admin Operations ---

    async createPlan(data) {
        const exists = await Plan.findOne({ name: data.name.toLowerCase() });
        if (exists) throw new Error("Plan name already exists.");

        return await Plan.create({
            planId: uuidv4(),
            name: data.name.toLowerCase(),
            description: data.description || "",
            priceMonthly: data.priceMonthly || 0,
            priceYearly: data.priceYearly || 0,
            maxDevices: data.maxDevices,
            maxDataRetentionDays: data.maxDataRetentionDays,
            maxDataExportMonths: data.maxDataExportMonths,
            features: data.features || {},
            enterprise: data.enterprise || {},
            isActive: data.isActive ?? true
        });
    }

    async updatePlan(planId, updates) {
        const updatedPlan = await Plan.findOneAndUpdate(
            { planId },
            { $set: updates },
            { new: true }
        );
        if (!updatedPlan) throw new Error("Plan not found.");
        return updatedPlan;
    }

    async deletePlan(planId) {
        const deleted = await Plan.findOneAndDelete({ planId });
        if (!deleted) throw new Error("Plan not found.");
        return deleted;
    }

    async getAllPlans() {
        return await Plan.find();
    }

    async togglePlan(planId) {
        const plan = await Plan.findOne({ planId });
        if (!plan) throw new Error("Plan not found.");
        plan.isActive = !plan.isActive;
        return await plan.save();
    }

    // --- User Operations ---

    async initSubscription(userid) {
        const existing = await UserSubscription.findOne({ userid });
        if (existing) throw new Error("Subscription already exists");

        const free = await Plan.findOne({ name: "freemium" });
        if (!free) throw new Error("FREEMIUM plan not found. Please run plan migration.");

        return await UserSubscription.create({
            userid,
            planId: free.planId,
            status: "active",
            billingCycle: "monthly",
            startDate: new Date()
        });
    }

    async getUserSubscription(userid) {
        return await getUserPlan(userid); // Using existing middleware helper which fetches sub+plan
    }

    async upgradeSubscription(userid, subscriptionId, targetPlanId) {
        const targetPlan = await Plan.findOne({ planId: targetPlanId, isActive: true });
        if (!targetPlan) throw new Error("Target plan not found or inactive.");

        const subscription = await UserSubscription.findOne({ subscriptionId, userid });
        if (!subscription) throw new Error("No active subscription found to upgrade");

        subscription.planId = targetPlanId;
        subscription.status = "active";
        subscription.billingCycle = "monthly"; // Default reset? Legacy behavior.
        subscription.startDate = new Date();
        subscription.endDate = null;

        const savedSub = await subscription.save();

        // 📡 Reconcile device states after plan upgrade (e.g. re-activate slot capacity)
        const reconcileDeviceStates = require('./reconcileDeviceStates');
        await reconcileDeviceStates(userid, subscription.organizationId, targetPlanId, userid);

        return savedSub;
    }

    async downgradeSubscription(userid, subscriptionId, targetPlanId) {
        const plan = await Plan.findOne({ planId: targetPlanId });
        if (!plan) throw new Error("Plan not found.");

        const subscription = await UserSubscription.findOne({ subscriptionId, userid });
        if (!subscription) throw new Error("No active subscription found to downgrade");

        subscription.planId = plan.planId;
        subscription.status = "active";
        subscription.startDate = new Date();
        subscription.endDate = null;

        const savedSub = await subscription.save();

        // 📡 Reconcile device states after plan downgrade (e.g. disable excess devices)
        const reconcileDeviceStates = require('./reconcileDeviceStates');
        await reconcileDeviceStates(userid, subscription.organizationId, plan.planId, userid);

        return savedSub;
    }

    async updateBillingCycle(userid, billingCycle) {
        if (!["monthly", "yearly"].includes(billingCycle)) {
            throw new Error("Invalid billing cycle");
        }
        const subscription = await UserSubscription.findOne({ userid });
        if (!subscription) throw new Error("No active subscription found");

        subscription.billingCycle = billingCycle;
        return await subscription.save();
    }

    async cancelSubscription(userid, subscriptionId) {
        const subscription = await UserSubscription.findOne({ subscriptionId, userid });
        if (!subscription) throw new Error("No active subscription found");

        subscription.status = "cancelled";
        subscription.endDate = new Date();
        return await subscription.save();
    }

    async reactivateSubscription(userid) {
        const subscription = await UserSubscription.findOne({ userid });
        if (!subscription) throw new Error("No subscription found");

        subscription.status = "active";
        subscription.endDate = null;
        return await subscription.save();
    }
    // --- Organization Operations ---

    async getOrgSubscription(organizationId) {
        const sub = await UserSubscription.findOne({
            organizationId,
            status: { $in: ['active', 'cancelled', 'grace_period'] }
        });

        if (!sub) return null; // Or throw, depends on controller usage. Let's return null to let controller decide.

        const plan = await Plan.findOne({ planId: sub.planId });
        return { sub, plan };
    }

    async upgradeOrgSubscription(organizationId, targetPlanId, userId) {
        const targetPlan = await Plan.findOne({ planId: targetPlanId, isActive: true });
        if (!targetPlan) throw new Error("Target plan not found or inactive.");

        let subscription = await UserSubscription.findOne({ organizationId, subscriptionScope: 'organization' });

        if (!subscription) {
            console.log(`[SubscriptionService] No existing org subscription for ${organizationId}. Creating new one.`);
            // Auto-Create Subscription if missing (Healing)
            // We need a userId to attach to. We use the actor (userId) passed in.
            subscription = new UserSubscription({
                subscriptionId: uuidv4(),
                userid: userId, // The admin performing the upgrade becomes the billing contact
                organizationId,
                subscriptionScope: "organization",
                planId: targetPlanId,
                status: "active",
                billingCycle: "monthly",
                startDate: new Date()
            });
        } else {
            subscription.planId = targetPlanId;
            subscription.status = "active";
            subscription.billingCycle = "monthly";
            subscription.startDate = new Date();
            subscription.endDate = null;
        }

        const savedSub = await subscription.save();

        console.log(`[SubscriptionService] Upgraded Org ${organizationId} to ${targetPlanId}. Syncing metadata...`);

        // Also update Organization metadata to reflect this
        // const Organization = require('../../models/organization/organizationModel'); // Moved to top
        const updateResult = await Organization.updateOne(
            { organizationId },
            {
                $set: {
                    "subscription.planId": targetPlanId,
                    "subscription.status": "active",
                    "planType": targetPlan.name // Sync planType for visual consistency
                }
            }
        );
        console.log(`[SubscriptionService] Org Update Result:`, updateResult);

        // 📡 Reconcile device states after plan upgrade (e.g. re-activate slot capacity)
        const reconcileDeviceStates = require('./reconcileDeviceStates');
        await reconcileDeviceStates(userId, organizationId, targetPlanId, userId);

        // CENTRALIZED INVALIDATION
        console.log(`[SubscriptionService] Calling InvalidateOrgCache...`);
        await OrganizationService.invalidateOrgCache(organizationId);

        return savedSub;
    }

    async downgradeOrgSubscription(organizationId, targetPlanId, userId) {
        const plan = await Plan.findOne({ planId: targetPlanId });
        if (!plan) throw new Error("Plan not found.");

        const subscription = await UserSubscription.findOne({ organizationId, subscriptionScope: 'organization' });
        if (!subscription) throw new Error("No active organization subscription found");

        // Logic for downgrade - usually effective end of cycle. For MVP, immediate or simple update.
        subscription.planId = plan.planId;
        subscription.status = "active";
        subscription.startDate = new Date();
        subscription.endDate = null;

        const savedSub = await subscription.save();

        const Organization = require('../../models/organization/organizationModel');
        await Organization.updateOne(
            { organizationId },
            {
                $set: {
                    "subscription.planId": plan.planId,
                    "subscription.status": "active",
                    "planType": plan.name
                }
            }
        );
        // CENTRALIZED INVALIDATION
        await OrganizationService.invalidateOrgCache(organizationId);

        // 📡 Reconcile device states after plan downgrade (excess devices are disabled)
        const reconcileDeviceStates = require('./reconcileDeviceStates');
        await reconcileDeviceStates(userId, organizationId, plan.planId, userId);

        return savedSub;
    }

    async updateOrgBillingCycle(organizationId, billingCycle) {
        if (!["monthly", "yearly"].includes(billingCycle)) {
            throw new Error("Invalid billing cycle");
        }
        const subscription = await UserSubscription.findOne({ organizationId, subscriptionScope: 'organization' });
        if (!subscription) throw new Error("No active organization subscription found");

        subscription.billingCycle = billingCycle;
        return await subscription.save();
    }

    async cancelOrgSubscription(organizationId) {
        const subscription = await UserSubscription.findOne({ organizationId, subscriptionScope: 'organization' });
        if (!subscription) throw new Error("No active organization subscription found");

        subscription.status = "cancelled";
        subscription.endDate = new Date();

        const savedSub = await subscription.save();

        const Organization = require('../../models/organization/organizationModel');
        await Organization.updateOne(
            { organizationId },
            { $set: { "subscription.status": "cancelled" } }
        );
        // CENTRALIZED INVALIDATION
        await OrganizationService.invalidateOrgCache(organizationId);

        return savedSub;
    }

    async reactivateOrgSubscription(organizationId) {
        const subscription = await UserSubscription.findOne({ organizationId, subscriptionScope: 'organization' });
        if (!subscription) throw new Error("No subscription found");

        subscription.status = "active";
        subscription.endDate = null;

        const savedSub = await subscription.save();

        const Organization = require('../../models/organization/organizationModel');
        await Organization.updateOne(
            { organizationId },
            { $set: { "subscription.status": "active" } }
        );
        // CENTRALIZED INVALIDATION
        await OrganizationService.invalidateOrgCache(organizationId);

        return savedSub;
    }
}

module.exports = new SubscriptionService();
