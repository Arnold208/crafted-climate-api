const WebhookSubscription = require('../models/subscriptions/WebhookSubscription');
const { webhookQueue } = require('../config/queue/bullMQ/bullqueue');
const { nanoid } = require('nanoid');
const logger = require('../utils/logger');

class WebhookService {
    /**
     * Dispatch an event to all active webhook subscriptions for an organization
     * @param {string} organizationId - Organization ID
     * @param {string} eventType - Event type (e.g., 'device.offline')
     * @param {Object} payload - Event payload data
     */
    async dispatch(organizationId, eventType, payload) {
        try {
            if (!organizationId) return;

            const subscriptions = await WebhookSubscription.find({
                organizationId,
                status: 'active',
                events: eventType
            });

            if (subscriptions.length === 0) {
                logger.debug(`[WebhookService] No active subscriptions for org ${organizationId} and event ${eventType}`);
                return;
            }

            logger.info(`[WebhookService] Enqueueing ${subscriptions.length} webhook deliveries for org ${organizationId} (Event: ${eventType})`);

            for (const sub of subscriptions) {
                const deliveryId = `del_${nanoid(12)}`;
                await webhookQueue.add('deliver', {
                    url: sub.url,
                    payload,
                    secret: sub.secret,
                    eventType,
                    deliveryId
                });
            }
        } catch (error) {
            logger.error('[WebhookService] Error dispatching webhook events:', error);
        }
    }

    /**
     * Register a new webhook subscription
     */
    async createSubscription(organizationId, userId, { url, events }) {
        if (!url || !url.match(/^https?:\/\//)) {
            throw new Error('Invalid URL. URL must start with http:// or https://');
        }

        const validEvents = ['device.online', 'device.offline', 'threshold.breached'];
        if (!events || !Array.isArray(events) || events.length === 0) {
            throw new Error('Events list is required and must be an array');
        }

        const invalidEvent = events.find(e => !validEvents.includes(e));
        if (invalidEvent) {
            throw new Error(`Invalid event type: ${invalidEvent}. Valid types: ${validEvents.join(', ')}`);
        }

        // Limit maximum subscriptions per organization (e.g., 5) to prevent abuse
        const count = await WebhookSubscription.countDocuments({ organizationId });
        if (count >= 5) {
            throw new Error('Maximum webhook subscriptions reached for this organization (Limit: 5)');
        }

        return await WebhookSubscription.create({
            organizationId,
            url,
            events,
            createdBy: userId
        });
    }

    /**
     * List all subscriptions for an organization
     */
    async getSubscriptions(organizationId) {
        return await WebhookSubscription.find({ organizationId });
    }

    /**
     * Update an existing subscription
     */
    async updateSubscription(organizationId, subscriptionId, updates) {
        const sub = await WebhookSubscription.findOne({ subscriptionId, organizationId });
        if (!sub) throw new Error('Webhook subscription not found');

        if (updates.url !== undefined) {
            if (!updates.url || !updates.url.match(/^https?:\/\//)) {
                throw new Error('Invalid URL. URL must start with http:// or https://');
            }
            sub.url = updates.url;
        }

        if (updates.events !== undefined) {
            const validEvents = ['device.online', 'device.offline', 'threshold.breached'];
            if (!Array.isArray(updates.events) || updates.events.length === 0) {
                throw new Error('Events must be a non-empty array');
            }
            const invalidEvent = updates.events.find(e => !validEvents.includes(e));
            if (invalidEvent) {
                throw new Error(`Invalid event: ${invalidEvent}`);
            }
            sub.events = updates.events;
        }

        if (updates.status !== undefined) {
            if (!['active', 'inactive'].includes(updates.status)) {
                throw new Error('Invalid status. Must be active or inactive');
            }
            sub.status = updates.status;
        }

        return await sub.save();
    }

    /**
     * Delete/Revoke a subscription
     */
    async deleteSubscription(organizationId, subscriptionId) {
        const result = await WebhookSubscription.deleteOne({ subscriptionId, organizationId });
        if (result.deletedCount === 0) {
            throw new Error('Webhook subscription not found');
        }
        return { success: true };
    }
}

module.exports = new WebhookService();
