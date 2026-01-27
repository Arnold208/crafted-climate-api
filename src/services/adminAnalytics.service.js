const User = require('../models/user/userModel');
const UserSubscription = require('../models/subscriptions/UserSubscription');
const RegisterDevice = require('../models/devices/registerDevice');
const Organization = require('../models/organization/organizationModel');

/**
 * Admin Analytics Service
 * Platform analytics and reporting
 */
class AdminAnalyticsService {

    /**
     * Get user growth metrics
     */
    async getUserGrowthMetrics(dateRange = {}) {
        const { startDate, endDate } = dateRange;

        const query = {};
        if (startDate && endDate) {
            query.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const [
            totalUsers,
            newUsers,
            verifiedUsers,
            adminUsers
        ] = await Promise.all([
            User.countDocuments({ deletedAt: null }),
            User.countDocuments(query),
            User.countDocuments({ verified: true, deletedAt: null }),
            User.countDocuments({ platformRole: 'admin', deletedAt: null })
        ]);

        // Get signup trend (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const signupTrend = await User.aggregate([
            {
                $match: {
                    createdAt: { $gte: thirtyDaysAgo },
                    deletedAt: null
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        return {
            totalUsers,
            newUsers,
            verifiedUsers,
            adminUsers,
            signupTrend,
            dateRange
        };
    }

    /**
     * Get device usage metrics
     */
    async getDeviceUsageMetrics(dateRange = {}) {
        const { client: redis } = require('../config/redis/redis');
        const now = Date.now();
        const cutoff = now - (30 * 60 * 1000);

        const [
            totalDevices,
            onlineCount,
            devicesByType
        ] = await Promise.all([
            RegisterDevice.countDocuments({ deletedAt: null }),
            // High-performance real-time query for ONLINE devices
            redis.zCount('devices:heartbeat', cutoff, '+inf'),
            RegisterDevice.aggregate([
                { $match: { deletedAt: null } },
                { $group: { _id: '$type', count: { $sum: 1 } } }
            ])
        ]);

        const offlineCount = totalDevices - onlineCount;

        const typeBreakdown = {};
        devicesByType.forEach(item => {
            typeBreakdown[item._id] = item.count;
        });

        return {
            totalDevices,
            onlineDevices: onlineCount,
            offlineDevices: offlineCount,
            onlinePercentage: totalDevices > 0 ? ((onlineCount / totalDevices) * 100).toFixed(2) : 0,
            typeBreakdown,
            dateRange
        };
    }

    /**
     * Get organization metrics
     */
    async getOrganizationMetrics() {
        const [
            totalOrgs,
            personalOrgs,
            businessOrgs,
            verifiedOrgs,
            partnerOrgs
        ] = await Promise.all([
            Organization.countDocuments({ deletedAt: null }),
            Organization.countDocuments({ organizationType: 'personal', deletedAt: null }),
            Organization.countDocuments({ organizationType: 'business', deletedAt: null }),
            Organization.countDocuments({ 'businessVerification.status': 'verified', deletedAt: null }),
            Organization.countDocuments({ 'partnerStatus.isPartner': true, deletedAt: null })
        ]);

        return {
            totalOrganizations: totalOrgs,
            personal: personalOrgs,
            business: businessOrgs,
            verified: verifiedOrgs,
            partners: partnerOrgs
        };
    }

    /**
     * Get API usage stats
     */
    async getAPIUsageStats(dateRange = {}) {
        const ApiKeyUsage = require('../models/apikey/ApiKeyUsage');
        const { startDate, endDate } = dateRange;

        const query = {};
        if (startDate && endDate) {
            query.timestamp = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const [
            totalRequests,
            errorCount,
            topEndpoints,
            usageTrend
        ] = await Promise.all([
            ApiKeyUsage.countDocuments(query),
            ApiKeyUsage.countDocuments({ ...query, statusCode: { $gte: 400 } }),
            ApiKeyUsage.aggregate([
                { $match: query },
                { $group: { _id: '$endpoint', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]),
            ApiKeyUsage.aggregate([
                { $match: query },
                {
                    $group: {
                        _id: {
                            $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
                        },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ])
        ]);

        return {
            totalRequests,
            errorRate: totalRequests > 0 ? ((errorCount / totalRequests) * 100).toFixed(2) : 0,
            topEndpoints,
            usageTrend,
            dateRange
        };
    }

    /**
     * Get platform overview
     */
    async getPlatformOverview() {
        const [
            userMetrics,
            deviceMetrics,
            orgMetrics,
            subscriptionMetrics
        ] = await Promise.all([
            this.getUserGrowthMetrics(),
            this.getDeviceUsageMetrics(),
            this.getOrganizationMetrics(),
            this.getSubscriptionMetrics()
        ]);

        return {
            users: userMetrics,
            devices: deviceMetrics,
            organizations: orgMetrics,
            subscriptions: subscriptionMetrics,
            timestamp: new Date()
        };
    }

    /**
     * Get subscription metrics
     */
    async getSubscriptionMetrics() {
        const [
            total,
            active,
            expired,
            cancelled
        ] = await Promise.all([
            UserSubscription.countDocuments(),
            UserSubscription.countDocuments({ status: 'active' }),
            UserSubscription.countDocuments({ status: 'expired' }),
            UserSubscription.countDocuments({ status: 'cancelled' })
        ]);

        return {
            total,
            active,
            expired,
            cancelled
        };
    }
}

module.exports = new AdminAnalyticsService();
