const mongoose = require('mongoose');
const crypto = require('crypto');
const { PARTNER_SCOPES } = require('../../config/scopes');

/**
 * API Key Model
 * Secure API key management for organizations and external partners.
 *
 * keyType:
 *   'org'     — issued by org users for their own integrations
 *   'partner' — issued by CC admin to an external partner organization
 *               (always scoped against org.partnerStatus.allowedScopes)
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

    // 'org' = self-service key; 'partner' = admin-issued for external partner
    keyType: {
        type: String,
        enum: ['org', 'partner'],
        default: 'org'
    },

    // Hashed key — NEVER stored or returned in plain text
    keyHash: {
        type: String,
        required: true
    },

    // First 12 chars for display (e.g. "cc_live_ab12...")
    keyPrefix: {
        type: String,
        required: true
    },

    status: {
        type: String,
        enum: ['active', 'suspended', 'revoked'],
        default: 'active'
    },

    // Granular permission scopes — sourced from src/config/scopes.js
    // Partner keys: must be a subset of org.partnerStatus.allowedScopes
    // Org keys    : limited to the 5 original device/telemetry scopes for backward compat
    permissions: [{
        type: String,
        enum: PARTNER_SCOPES   // full platform scope list — enforced at service layer per keyType
    }],

    // Rate limiting per key (partner rate limit is multiplied by tier multiplier at runtime)
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
    lastUsedAt: { type: Date },
    usageCount: { type: Number, default: 0 },

    // Rotation
    rotationSchedule: {
        type: String,
        enum: ['none', 'monthly', 'quarterly', 'yearly'],
        default: 'none'
    },
    nextRotationDate: { type: Date },

    // IP whitelist (optional)
    allowedIPs: [String],

    // Audit
    createdBy:     { type: String, required: true },
    revokedBy:     String,
    revokedAt:     Date,
    revokedReason: String,

    metadata: { type: Map, of: String }
}, {
    timestamps: true,
    collection: 'apikeys'
});

// Indexes
ApiKeySchema.index({ organizationId: 1, status: 1 });
ApiKeySchema.index({ keyPrefix: 1 });
ApiKeySchema.index({ expiresAt: 1 });
ApiKeySchema.index({ keyType: 1, status: 1 });

// Check if key is currently valid
ApiKeySchema.methods.isValid = function () {
    if (this.status !== 'active') return false;
    if (this.expiresAt && this.expiresAt < new Date()) return false;
    return true;
};

// Generate a display prefix — 'cc_live_...' or 'cc_test_...'
ApiKeySchema.statics.generatePrefix = function (environment = 'live') {
    const randomPart = crypto.randomBytes(4).toString('hex');
    return `cc_${environment}_${randomPart}`;
};

module.exports = mongoose.model('ApiKey', ApiKeySchema);
