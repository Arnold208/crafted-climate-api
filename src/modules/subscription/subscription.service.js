const Plan = require('../../models/subscriptions/Plan');
const UserSubscription = require('../../models/subscriptions/UserSubscription');
const getUserPlan = require('../../middleware/subscriptions/getUserPlan');
const { v4: uuidv4 } = require('uuid');

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

    async upgradeSubscription(userid, targetPlanId) {
        const targetPlan = await Plan.findOne({ planId: targetPlanId, isActive: true });
        if (!targetPlan) throw new Error("Target plan not found or inactive.");

        const subscription = await UserSubscription.findOne({ userid });
        if (!subscription) throw new Error("No active subscription found to upgrade");

        subscription.planId = targetPlanId;
        subscription.status = "active";
        subscription.billingCycle = "monthly"; // Default reset? Legacy behavior.
        subscription.startDate = new Date();
        subscription.endDate = null;

        return await subscription.save();
    }

    async downgradeSubscription(userid, targetPlanId) {
        const plan = await Plan.findOne({ planId: targetPlanId });
        if (!plan) throw new Error("Plan not found.");

        const subscription = await UserSubscription.findOne({ userid });
        if (!subscription) throw new Error("No active subscription found to downgrade");

        subscription.planId = plan.planId;
        subscription.status = "active";
        subscription.startDate = new Date();
        subscription.endDate = null;

        return await subscription.save();
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

    async cancelSubscription(userid) {
        const subscription = await UserSubscription.findOne({ userid });
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
}

module.exports = new SubscriptionService();
