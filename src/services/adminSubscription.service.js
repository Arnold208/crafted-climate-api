const UserSubscription = require('../models/subscriptions/UserSubscription');
const Plan = require('../models/subscriptions/Plan');
const User = require('../models/user/userModel');
const { createAuditLog } = require('../utils/auditLogger');

/**
 * Admin Subscription Service
 * Platform admin operations for subscription management
 */
class AdminSubscriptionService {

    /**
     * List all subscriptions with pagination and filters
     */
    async listSubscriptions(filters = {}, pagination = {}) {
        const {
            status,
            planId,
            billingCycle,
            userid
        } = filters;

        const {
            page = 1,
            limit = 50
        } = pagination;

        const skip = (page - 1) * limit;

        // Build query
        const query = {};

        if (status) {
            query.status = status;
        }

        if (planId) {
            query.planId = planId;
        }

        if (billingCycle) {
            query.billingCycle = billingCycle;
        }

        if (userid) {
            query.userid = userid;
        }

        const [subscriptions, total] = await Promise.all([
            UserSubscription.find(query)
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 })
                .lean(),
            UserSubscription.countDocuments(query)
        ]);

        // Populate user and plan details
        for (let sub of subscriptions) {
            const user = await User.findOne({ userid: sub.userid }).select('email username').lean();
            const plan = await Plan.findOne({ planId: sub.planId }).select('name tier').lean();
            sub.user = user;
            sub.plan = plan;
        }

        return {
            subscriptions,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Get subscription details
     */
    async getSubscriptionDetails(subscriptionId) {
        const subscription = await UserSubscription.findOne({ subscriptionId }).lean();

        if (!subscription) {
            throw new Error('Subscription not found');
        }

        // Get user details
        const user = await User.findOne({ userid: subscription.userid })
            .select('userid email username firstName lastName')
            .lean();

        // Get plan details
        const plan = await Plan.findOne({ planId: subscription.planId }).lean();

        return {
            ...subscription,
            user,
            plan
        };
    }

    /**
     * Change subscription plan
     */
    async changePlan(subscriptionId, newPlanId, adminId) {
        const subscription = await UserSubscription.findOne({ subscriptionId });
        if (!subscription) {
            throw new Error('Subscription not found');
        }

        const newPlan = await Plan.findOne({ planId: newPlanId });
        if (!newPlan) {
            throw new Error('Plan not found');
        }

        const oldPlanId = subscription.planId;

        subscription.planId = newPlanId;
        subscription.previousPlanId = oldPlanId;
        await subscription.save();

        // Audit log
        await createAuditLog({
            action: 'ADMIN_CHANGE_SUBSCRIPTION_PLAN',
            userid: adminId,
            targetUserId: subscription.userid,
            details: {
                subscriptionId,
                oldPlanId,
                newPlanId
            },
            ipAddress: null
        });

        return subscription;
    }

    /**
     * Extend subscription expiry
     */
    async extendExpiry(subscriptionId, newEndDate, adminId) {
        const subscription = await UserSubscription.findOne({ subscriptionId });
        if (!subscription) {
            throw new Error('Subscription not found');
        }

        const oldEndDate = subscription.endDate;

        subscription.endDate = new Date(newEndDate);
        await subscription.save();

        // Audit log
        await createAuditLog({
            action: 'ADMIN_EXTEND_SUBSCRIPTION',
            userid: adminId,
            targetUserId: subscription.userid,
            details: {
                subscriptionId,
                oldEndDate,
                newEndDate
            },
            ipAddress: null
        });

        return subscription;
    }

    /**
     * Cancel subscription
     */
    async cancelSubscription(subscriptionId, reason, adminId) {
        const subscription = await UserSubscription.findOne({ subscriptionId });
        if (!subscription) {
            throw new Error('Subscription not found');
        }

        if (subscription.status === 'cancelled') {
            throw new Error('Subscription already cancelled');
        }

        subscription.status = 'cancelled';
        await subscription.save();

        // Audit log
        await createAuditLog({
            action: 'ADMIN_CANCEL_SUBSCRIPTION',
            userid: adminId,
            targetUserId: subscription.userid,
            details: {
                subscriptionId,
                reason
            },
            ipAddress: null
        });

        return {
            success: true,
            message: 'Subscription cancelled successfully'
        };
    }

    /**
     * Get expiring subscriptions
     */
    async getExpiringSubscriptions(days = 7) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + days);

        const subscriptions = await UserSubscription.find({
            status: 'active',
            endDate: {
                $gte: new Date(),
                $lte: futureDate
            }
        }).lean();

        // Populate user details
        for (let sub of subscriptions) {
            const user = await User.findOne({ userid: sub.userid }).select('email username').lean();
            sub.user = user;
        }

        return {
            subscriptions,
            count: subscriptions.length,
            daysAhead: days
        };
    }

    /**
     * Get revenue analytics
     */
    async getRevenueAnalytics(dateRange = {}) {
        const { startDate, endDate } = dateRange;

        const query = {
            status: { $in: ['active', 'grace_period'] }
        };

        if (startDate && endDate) {
            query.startDate = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const subscriptions = await UserSubscription.find(query).lean();

        // Get all plans for pricing
        const plans = await Plan.find().lean();
        const planPricing = {};
        plans.forEach(plan => {
            planPricing[plan.planId] = plan.pricing || {};
        });

        // Calculate metrics
        let totalMRR = 0;
        let totalARR = 0;
        const billingCycleBreakdown = {
            free: 0,
            monthly: 0,
            yearly: 0
        };

        subscriptions.forEach(sub => {
            const pricing = planPricing[sub.planId];

            if (sub.billingCycle === 'monthly' && pricing?.monthly) {
                totalMRR += pricing.monthly;
            } else if (sub.billingCycle === 'yearly' && pricing?.yearly) {
                totalARR += pricing.yearly;
                totalMRR += pricing.yearly / 12;
            }

            billingCycleBreakdown[sub.billingCycle]++;
        });

        totalARR += totalMRR * 12;

        return {
            totalSubscriptions: subscriptions.length,
            MRR: totalMRR,
            ARR: totalARR,
            billingCycleBreakdown,
            dateRange: { startDate, endDate }
        };
    }
}

module.exports = new AdminSubscriptionService();
