const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * API Key Model
 * Secure API key management for organizations
 */
const ApiKeySchema = new mongoose.Schema({
    keyId: {
        type: String,
        required: true,
        unique: true
    },

    organizationId: {
        type: String,
        required: true,
        index: true
    },

    name: {
        type: String,
        required: true,
        maxlength: 100
    },

    // Hashed key (never store plain text)
    keyHash: {
        type: String,
        required: true
    },

    // First 8 characters for display (e.g., "ck_live_12345678...")
    keyPrefix: {
        type: String,
        required: true
    },

    status: {
        type: String,
        enum: ['active', 'suspended', 'revoked'],
        default: 'active'
    },

    // Granular permissions
    permissions: [{
        type: String,
        enum: [
            'telemetry:read',
            'telemetry:write',
            'devices:read',
            'devices:write',
            'analytics:read'
        ]
    }],

    // Rate limiting per key
    rateLimit: {
        requests: { type: Number, default: 1000 },
        windowMs: { type: Number, default: 3600000 } // 1 hour
    },

    // Optional expiration
    expiresAt: {
        type: Date,
        default: null
    },

    // Usage tracking
    lastUsedAt: {
        type: Date
    },

    usageCount: {
        type: Number,
        default: 0
    },

    // Rotation settings
    rotationSchedule: {
        type: String,
        enum: ['none', 'monthly', 'quarterly', 'yearly'],
        default: 'none'
    },

    nextRotationDate: {
        type: Date
    },

    // IP restrictions (optional)
    allowedIPs: [String],

    // Metadata
    createdBy: {
        type: String,
        required: true
    },

    revokedBy: String,
    revokedAt: Date,
    revokedReason: String,

    metadata: {
        type: Map,
        of: String
    }
}, {
    timestamps: true,
    collection: 'apikeys'
});

// Indexes for performance
ApiKeySchema.index({ organizationId: 1, status: 1 });
ApiKeySchema.index({ keyPrefix: 1 });
ApiKeySchema.index({ expiresAt: 1 });

// Method to check if key is valid
ApiKeySchema.methods.isValid = function () {
    if (this.status !== 'active') return false;
    if (this.expiresAt && this.expiresAt < new Date()) return false;
    return true;
};

// Static method to generate key prefix
ApiKeySchema.statics.generatePrefix = function (environment = 'live') {
    const randomPart = crypto.randomBytes(4).toString('hex');
    return `ck_${environment}_${randomPart}`;
};

module.exports = mongoose.model('ApiKey', ApiKeySchema);
