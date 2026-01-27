const mongoose = require('mongoose');

/**
 * Notification Preference Model
 * User notification preferences
 */
const NotificationPreferenceSchema = new mongoose.Schema({
    userid: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    preferences: {
        // Global channel preferences
        email: {
            enabled: { type: Boolean, default: true },
            frequency: {
                type: String,
                enum: ['instant', 'daily', 'weekly'],
                default: 'instant'
            }
        },
        inApp: {
            enabled: { type: Boolean, default: true }
        },
        push: {
            enabled: { type: Boolean, default: false }
        },

        // Category-specific preferences
        categories: {
            security: { type: Boolean, default: true },
            billing: { type: Boolean, default: true },
            updates: { type: Boolean, default: true },
            support: { type: Boolean, default: true },
            admin: { type: Boolean, default: true },
            system: { type: Boolean, default: true }
        }
    },

    // Quiet hours (no notifications)
    quietHours: {
        enabled: { type: Boolean, default: false },
        start: { type: String, default: '22:00' }, // 24h format
        end: { type: String, default: '08:00' },
        timezone: { type: String, default: 'UTC' }
    },

    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    collection: 'notificationpreferences'
});

// Get default preferences for new user
NotificationPreferenceSchema.statics.getDefaults = function () {
    return {
        preferences: {
            email: { enabled: true, frequency: 'instant' },
            inApp: { enabled: true },
            push: { enabled: false },
            categories: {
                security: true,
                billing: true,
                updates: true,
                support: true,
                admin: true,
                system: true
            }
        },
        quietHours: {
            enabled: false,
            start: '22:00',
            end: '08:00',
            timezone: 'UTC'
        }
    };
};

module.exports = mongoose.model('NotificationPreference', NotificationPreferenceSchema);
