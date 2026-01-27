const adminSubscriptionService = require('../../services/adminSubscription.service');

class AdminSubscriptionController {

    /**
     * List all subscriptions
     */
    async listSubscriptions(req, res) {
        try {
            const filters = {
                status: req.query.status,
                planId: req.query.planId,
                billingCycle: req.query.billingCycle,
                userid: req.query.userid
            };

            const pagination = {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 50
            };

            const result = await adminSubscriptionService.listSubscriptions(filters, pagination);

            res.status(200).json({
                success: true,
                data: result.subscriptions,
                pagination: result.pagination
            });
        } catch (error) {
            console.error('[AdminSubscriptionController] List error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Get subscription details
     */
    async getSubscriptionDetails(req, res) {
        try {
            const { subscriptionId } = req.params;
            const subscription = await adminSubscriptionService.getSubscriptionDetails(subscriptionId);

            res.status(200).json({
                success: true,
                data: subscription
            });
        } catch (error) {
            console.error('[AdminSubscriptionController] Get details error:', error);
            res.status(404).json({ success: false, message: error.message });
        }
    }

    /**
     * Change subscription plan
     */
    async changePlan(req, res) {
        try {
            const { subscriptionId } = req.params;
            const { planId } = req.body;
            const adminId = req.user.userid;

            if (!planId) {
                return res.status(400).json({ success: false, message: 'Plan ID is required' });
            }

            const subscription = await adminSubscriptionService.changePlan(subscriptionId, planId, adminId);

            res.status(200).json({
                success: true,
                message: 'Subscription plan updated successfully',
                data: subscription
            });
        } catch (error) {
            console.error('[AdminSubscriptionController] Change plan error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Extend subscription expiry
     */
    async extendExpiry(req, res) {
        try {
            const { subscriptionId } = req.params;
            const { endDate } = req.body;
            const adminId = req.user.userid;

            if (!endDate) {
                return res.status(400).json({ success: false, message: 'End date is required' });
            }

            const subscription = await adminSubscriptionService.extendExpiry(subscriptionId, endDate, adminId);

            res.status(200).json({
                success: true,
                message: 'Subscription extended successfully',
                data: subscription
            });
        } catch (error) {
            console.error('[AdminSubscriptionController] Extend error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Cancel subscription
     */
    async cancelSubscription(req, res) {
        try {
            const { subscriptionId } = req.params;
            const { reason } = req.body;
            const adminId = req.user.userid;

            const result = await adminSubscriptionService.cancelSubscription(subscriptionId, reason, adminId);

            res.status(200).json(result);
        } catch (error) {
            console.error('[AdminSubscriptionController] Cancel error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Get expiring subscriptions
     */
    async getExpiringSubscriptions(req, res) {
        try {
            const days = parseInt(req.query.days) || 7;
            const result = await adminSubscriptionService.getExpiringSubscriptions(days);

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[AdminSubscriptionController] Expiring error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Get revenue analytics
     */
    async getRevenueAnalytics(req, res) {
        try {
            const dateRange = {
                startDate: req.query.startDate,
                endDate: req.query.endDate
            };

            const result = await adminSubscriptionService.getRevenueAnalytics(dateRange);

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[AdminSubscriptionController] Revenue error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = new AdminSubscriptionController();
