const mongoose = require('mongoose');

/**
 * CORS Settings Model - Singleton (only one document)
 * Platform admins can configure CORS dynamically
 */
const CorsSettingsSchema = new mongoose.Schema({
    // Singleton identifier - always 'global'
    settingId: {
        type: String,
        default: 'global',
        unique: true,
        immutable: true
    },

    // CORS Enforcement
    enabled: {
        type: Boolean,
        default: true,
        required: true
    },

    // Allowed Origins
    allowedOrigins: {
        type: [String],
        default: ['http://localhost:3000', 'http://localhost:3001'],
        validate: {
            validator: function (origins) {
                // Ensure at least one origin is always allowed to prevent lockout
                return origins && origins.length > 0;
            },
            message: 'At least one origin must be allowed to prevent system lockout'
        }
    },

    // Allow credentials (cookies, auth headers)
    allowCredentials: {
        type: Boolean,
        default: true
    },

    // Safety: Fallback to env if DB fails
    useFallback: {
        type: Boolean,
        default: true
    },

    // Audit Trail
    updatedBy: {
        type: String,
        required: true
    },

    lastUpdatedAt: {
        type: Date,
        default: Date.now
    },

    // Change History (last 10 changes)
    changeHistory: [{
        action: String,
        performedBy: String,
        timestamp: { type: Date, default: Date.now },
        previousValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed
    }]
}, {
    timestamps: true,
    collection: 'corssettings'
});

// Middleware to limit change history to last 10 entries
CorsSettingsSchema.pre('save', function (next) {
    if (this.changeHistory && this.changeHistory.length > 10) {
        this.changeHistory = this.changeHistory.slice(-10);
    }
    next();
});

module.exports = mongoose.model('CorsSettings', CorsSettingsSchema);
