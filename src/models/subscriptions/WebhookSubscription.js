const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

/**
 * Webhook Subscription Schema
 * Outgoing event-delivery registration for organizations
 */
const WebhookSubscriptionSchema = new mongoose.Schema({
    subscriptionId: {
        type: String,
        required: true,
        unique: true,
        default: () => `wh_${nanoid(12)}`
    },
    organizationId: {
        type: String,
        required: true,
        index: true
    },
    url: {
        type: String,
        required: true
    },
    events: [{
        type: String,
        enum: ['device.online', 'device.offline', 'threshold.breached'],
        required: true
    }],
    // HMAC SHA256 secret key for request signature verification
    secret: {
        type: String,
        required: true,
        default: () => require('crypto').randomBytes(24).toString('hex')
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended'],
        default: 'active'
    },
    createdBy: {
        type: String,
        required: true
    }
}, {
    timestamps: true,
    collection: 'webhook_subscriptions'
});

WebhookSubscriptionSchema.index({ organizationId: 1, status: 1 });

module.exports = mongoose.model('WebhookSubscription', WebhookSubscriptionSchema);
