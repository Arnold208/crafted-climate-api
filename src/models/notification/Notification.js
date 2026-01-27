const mongoose = require('mongoose');

/**
 * Notification Model
 * Multi-channel notification system
 */
const NotificationSchema = new mongoose.Schema({
    notificationId: {
        type: String,
        required: true,
        unique: true
    },

    userid: {
        type: String,
        required: true,
        index: true
    },

    type: {
        type: String,
        enum: ['info', 'success', 'warning', 'error', 'system'],
        default: 'info'
    },

    category: {
        type: String,
        enum: ['security', 'billing', 'updates', 'support', 'admin', 'system'],
        required: true,
        index: true
    },

    title: {
        type: String,
        required: true,
        maxlength: 200
    },

    message: {
        type: String,
        required: true,
        maxlength: 1000
    },

    // Optional action URL
    actionUrl: {
        type: String
    },

    actionText: {
        type: String,
        default: 'View'
    },

    // Delivery channels
    channels: [{
        type: String,
        enum: ['in_app', 'email', 'push']
    }],

    // Read status
    read: {
        type: Boolean,
        default: false,
        index: true
    },

    readAt: {
        type: Date
    },

    // Delivery status
    deliveryStatus: {
        in_app: {
            delivered: { type: Boolean, default: false },
            deliveredAt: Date
        },
        email: {
            delivered: { type: Boolean, default: false },
            deliveredAt: Date,
            error: String
        },
        push: {
            delivered: { type: Boolean, default: false },
            deliveredAt: Date,
            error: String
        }
    },

    // Metadata
    metadata: {
        type: Map,
        of: String
    },

    // Auto-expire old notifications
    expiresAt: {
        type: Date
    },

    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: false,
    collection: 'notifications'
});

// Indexes for efficient queries
NotificationSchema.index({ userid: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ userid: 1, category: 1 });

// TTL index - auto-delete after expiration
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Mark as delivered for in-app
NotificationSchema.methods.markDelivered = function (channel) {
    if (this.deliveryStatus[channel]) {
        this.deliveryStatus[channel].delivered = true;
        this.deliveryStatus[channel].deliveredAt = new Date();
    }
};

module.exports = mongoose.model('Notification', NotificationSchema);
