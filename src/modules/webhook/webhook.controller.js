const webhookService = require('../../services/webhook.service');

class WebhookController {
    async createSubscription(req, res) {
        try {
            const { url, events } = req.body;
            const sub = await webhookService.createSubscription(
                req.currentOrgId,
                req.user.userid,
                { url, events }
            );

            return res.status(201).json({
                success: true,
                message: 'Webhook subscription created successfully',
                data: sub
            });
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }

    async getSubscriptions(req, res) {
        try {
            const subs = await webhookService.getSubscriptions(req.currentOrgId);
            return res.status(200).json({
                success: true,
                data: subs
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve webhook subscriptions',
                error: error.message
            });
        }
    }

    async updateSubscription(req, res) {
        try {
            const { subscriptionId } = req.params;
            const sub = await webhookService.updateSubscription(
                req.currentOrgId,
                subscriptionId,
                req.body
            );

            return res.status(200).json({
                success: true,
                message: 'Webhook subscription updated successfully',
                data: sub
            });
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }

    async deleteSubscription(req, res) {
        try {
            const { subscriptionId } = req.params;
            await webhookService.deleteSubscription(req.currentOrgId, subscriptionId);

            return res.status(200).json({
                success: true,
                message: 'Webhook subscription deleted successfully'
            });
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
}

module.exports = new WebhookController();
