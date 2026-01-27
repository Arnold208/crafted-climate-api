const mongoose = require('mongoose');

/**
 * System Configuration Model - Singleton
 * Platform-wide configuration managed by admins
 */
const SystemConfigSchema = new mongoose.Schema({
    // Singleton identifier
    configId: {
        type: String,
        default: 'global',
        unique: true,
        immutable: true
    },

    // Feature Flags
    features: {
        userRegistration: { type: Boolean, default: true },
        googleOAuth: { type: Boolean, default: true },
        deviceRegistration: { type: Boolean, default: true },
        organizationCreation: { type: Boolean, default: true },
        partnerProgram: { type: Boolean, default: true },
        apiAccess: { type: Boolean, default: true },
        telemetryCollection: { type: Boolean, default: true },
        exportData: { type: Boolean, default: true }
    },

    // Rate Limits (requests per window)
    rateLimits: {
        global: { windowMs: { type: Number, default: 900000 }, max: { type: Number, default: 100 } },
        auth: { windowMs: { type: Number, default: 900000 }, max: { type: Number, default: 5 } },
        api: { windowMs: { type: Number, default: 60000 }, max: { type: Number, default: 60 } },
        telemetry: { windowMs: { type: Number, default: 60000 }, max: { type: Number, default: 100 } }
    },

    // Maintenance Mode
    maintenance: {
        enabled: { type: Boolean, default: false },
        message: { type: String, default: 'System maintenance in progress' },
        allowedIPs: [String],
        scheduledStart: Date,
        scheduledEnd: Date
    },

    // Email Configuration
    email: {
        enabled: { type: Boolean, default: true },
        provider: { type: String, default: 'smtp' },
        fromAddress: { type: String, default: 'noreply@craftedclimate.com' },
        fromName: { type: String, default: 'CraftedClimate' }
    },

    // Audit Trail
    updatedBy: { type: String, required: true },
    lastUpdatedAt: { type: Date, default: Date.now },

    changeHistory: [{
        field: String,
        oldValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed,
        changedBy: String,
        changedAt: { type: Date, default: Date.now }
    }]
}, {
    timestamps: true,
    collection: 'systemconfig'
});

// Limit change history to last 20 entries
SystemConfigSchema.pre('save', function (next) {
    if (this.changeHistory && this.changeHistory.length > 20) {
        this.changeHistory = this.changeHistory.slice(-20);
    }
    next();
});

module.exports = mongoose.model('SystemConfig', SystemConfigSchema);
