const adminAnalyticsService = require('../../services/adminAnalytics.service');

class AdminAnalyticsController {

    async getUserGrowth(req, res) {
        try {
            const dateRange = {
                startDate: req.query.startDate,
                endDate: req.query.endDate
            };

            const result = await adminAnalyticsService.getUserGrowthMetrics(dateRange);

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[AdminAnalyticsController] User growth error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async getDeviceUsage(req, res) {
        try {
            const dateRange = {
                startDate: req.query.startDate,
                endDate: req.query.endDate
            };

            const result = await adminAnalyticsService.getDeviceUsageMetrics(dateRange);

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[AdminAnalyticsController] Device usage error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async getOrganizationMetrics(req, res) {
        try {
            const result = await adminAnalyticsService.getOrganizationMetrics();

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[AdminAnalyticsController] Org metrics error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async getAPIUsage(req, res) {
        try {
            const dateRange = {
                startDate: req.query.startDate,
                endDate: req.query.endDate
            };

            const result = await adminAnalyticsService.getAPIUsageStats(dateRange);

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[AdminAnalyticsController] API usage error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async getPlatformOverview(req, res) {
        try {
            const result = await adminAnalyticsService.getPlatformOverview();

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[AdminAnalyticsController] Platform overview error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = new AdminAnalyticsController();
