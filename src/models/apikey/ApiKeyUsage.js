const mongoose = require('mongoose');

/**
 * API Key Usage Model
 * Track API key usage for analytics and security
 */
const ApiKeyUsageSchema = new mongoose.Schema({
    keyId: {
        type: String,
        required: true,
        index: true
    },

    organizationId: {
        type: String,
        required: true,
        index: true
    },

    endpoint: {
        type: String,
        required: true
    },

    method: {
        type: String,
        required: true,
        enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
    },

    statusCode: {
        type: Number,
        required: true
    },

    responseTime: {
        type: Number // milliseconds
    },

    ipAddress: {
        type: String
    },

    userAgent: {
        type: String
    },

    timestamp: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: false,
    collection: 'apikeyusage'
});

// Compound indexes for efficient queries
ApiKeyUsageSchema.index({ keyId: 1, timestamp: -1 });
ApiKeyUsageSchema.index({ organizationId: 1, timestamp: -1 });

// TTL index - auto-delete after 90 days
ApiKeyUsageSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

module.exports = mongoose.model('ApiKeyUsage', ApiKeyUsageSchema);
