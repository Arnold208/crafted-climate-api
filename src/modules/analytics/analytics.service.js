const User = require('../../models/user/userModel');
const Organization = require('../../models/organization/organizationModel');
const Device = require('../../models/devices/registerDevice');
const UserSubscription = require('../../models/subscriptions/UserSubscription');
const Plan = require('../../models/subscriptions/Plan');

class AnalyticsService {

    /**
     * Super Admin: System-Wide Overview
     */
    async getSystemOverview() {
        const { client: redis } = require('../../config/redis/redis');
        const now = Date.now();
        const cutoff = now - (30 * 60 * 1000);

        const [
            totalUsers,
            verifiedUsers,
            totalOrgs,
            activeOrgs,
            totalDevices,
            onlineDevices,
            subscriptions
        ] = await Promise.all([
            User.countDocuments({ deletedAt: null }),
            User.countDocuments({ deletedAt: null, verified: true }),
            Organization.countDocuments({ deletedAt: null }),
            Organization.countDocuments({ deletedAt: null, 'subscription.status': 'active' }),
            Device.countDocuments({ deletedAt: null }),
            // High-performance real-time query from Redis ZSET
            redis.zCount('devices:heartbeat', cutoff, '+inf'),
            UserSubscription.find({ status: 'active' })
        ]);

        // Revenue Calculation (Estimated MRR)
        // Note: This is an estimation based on active plans. Real revenue should come from Stripe/Payment Provider.
        let estimatedMRR = 0;
        const planCache = new Map();

        for (const sub of subscriptions) {
            let plan = planCache.get(sub.planId);
            if (!plan) {
                plan = await Plan.findOne({ planId: sub.planId });
                if (plan) planCache.set(sub.planId, plan);
            }

            if (plan) {
                if (sub.billingCycle === 'monthly') estimatedMRR += plan.priceMonthly;
                if (sub.billingCycle === 'yearly') estimatedMRR += (plan.priceYearly / 12);
            }
        }

        return {
            users: { total: totalUsers, verified: verifiedUsers },
            organizations: { total: totalOrgs, active: activeOrgs },
            devices: { total: totalDevices, online: onlineDevices, offline: totalDevices - onlineDevices },
            subscriptions: { activeCount: subscriptions.length },
            financials: { estimatedMRR: parseFloat(estimatedMRR.toFixed(2)) }
        };
    }

    /**
     * Org Admin: Organization Overview
     */
    async getOrgOverview(organizationId) {
        const { client: redis } = require('../../config/redis/redis');
        const now = Date.now();
        const cutoff = now - (30 * 60 * 1000);

        // Validation: Check Org exists? (Controller usually handles access check)
        const org = await Organization.findOne({ organizationId });
        if (!org) throw new Error("Organization not found");

        const [
            allOrgDevices,
            subscription
        ] = await Promise.all([
            Device.find({ organizationId, deletedAt: null }, { auid: 1 }).lean(),
            UserSubscription.findOne({ organizationId, status: 'active' })
        ]);

        const totalDevices = allOrgDevices.length;

        // Count how many of these specific AUIDs have recent heartbeats in Redis
        let onlineDevices = 0;
        if (totalDevices > 0) {
            const auids = allOrgDevices.map(d => d.auid);
            // Pipeline/Multi for efficiency
            const pipeline = redis.multi();
            auids.forEach(auid => pipeline.zScore('devices:heartbeat', auid));
            const scores = await pipeline.exec();

            onlineDevices = scores.filter(score => score && Number(score) >= cutoff).length;
        }

        let planDetails = null;
        if (subscription) {
            const plan = await Plan.findOne({ planId: subscription.planId });
            planDetails = {
                name: plan?.name || 'Unknown',
                maxDevices: plan?.maxDevices || 0,
                modules: plan?.features || {}
            };
        }

        return {
            organization: {
                name: org.name,
                membersCount: org.collaborators.length,
                createdAt: org.createdAt
            },
            devices: {
                total: totalDevices,
                online: onlineDevices,
                offline: totalDevices - onlineDevices
            },
            subscription: {
                status: subscription ? subscription.status : 'none',
                plan: planDetails,
                usage: subscription?.usage || {}
            }
        };
    }

    /**
     * AI Insights & Anomaly Detection
     * Tiered by Plan: 'basic' (Rules) vs 'advanced' (ML Prediction)
     */
    async getInsights(orgId, planFeatures) {
        const level = planFeatures.aiInsightsLevel || 'none';

        if (level === 'none') {
            throw new Error("AI Analytics not included in your plan.");
        }

        const stats = await this.getOrgOverview(orgId);

        // Mock AI Generation based on Tier
        let insights = [];

        if (level === 'basic' || level === 'advanced') {
            // Basic: Rule-based Anomalies
            if (stats.devices.offline > 0) {
                insights.push({
                    type: 'anomaly',
                    severity: 'medium',
                    message: `${stats.devices.offline} devices are offline. Check connectivity.`
                });
            }
            if (stats.devices.total === 0) {
                insights.push({
                    type: 'onboarding',
                    severity: 'info',
                    message: "No devices connected yet. Add your first device to start tracking."
                });
            }
        }

        if (level === 'advanced') {
            // Advanced: Predictive / Forecasting (Mocking ML output)
            insights.push({
                type: 'prediction',
                severity: 'low',
                message: "Based on usage trends, you will reach your data retention limit in 12 days."
            });
            insights.push({
                type: 'optimization',
                severity: 'high',
                message: "Device 'Env-01' is reporting erratic temperature spikes. Sensor maintenance recommended."
            });
            insights.push({
                type: 'benchmark',
                severity: 'info',
                message: "Organization-wide power efficiency is 15% better than last month's baseline."
            });
            insights.push({
                type: 'forecast',
                severity: 'medium',
                message: "Predicted water quality dip in Project 'Aqua-Central' scheduled for tomorrow due to historical effluent trends."
            });
        }

        return {
            level,
            generatedAt: new Date(),
            insights
        };
    }
}

module.exports = new AnalyticsService();
