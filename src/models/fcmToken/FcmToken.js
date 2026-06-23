const mongoose = require('mongoose');

/**
 * FcmToken Model
 *
 * Stores FCM device tokens in a SEPARATE collection from users.
 *
 * Why separate (vs. a field on the user document)?
 * ─────────────────────────────────────────────────
 * 1. Multi-device: one user may have multiple phones/tablets.
 *    A single `fcmToken` field on User would overwrite on each login.
 * 2. Dead-token cleanup is surgical — delete the token doc, never touch the user.
 * 3. Mass-send queries (get all active tokens) hit a small focused collection
 *    instead of scanning every user document.
 * 4. Token rotation (FCM can refresh tokens silently) is tracked independently
 *    via `lastActiveAt` without polluting user update history.
 */
const FcmTokenSchema = new mongoose.Schema({
    userid: {
        type: String,
        required: true,
        index: true,
    },

    token: {
        type: String,
        required: true,
        unique: true,     // One doc per token (not per user)
        index: true,
    },

    platform: {
        type: String,
        enum: ['android', 'ios', 'web'],
        default: 'android',
    },

    // Optional device fingerprint — helps identify which device a token belongs to
    deviceId: {
        type: String,
        default: null,
    },

    // Subscribed FCM topics (e.g. 'all-users', 'region-ghana')
    topics: {
        type: [String],
        default: [],
    },

    // Updated whenever the app re-registers or FCM rotates the token
    lastActiveAt: {
        type: Date,
        default: Date.now,
        // NOTE: index is declared below as a TTL index — do not add index:true here
    },

    // Set to true when FCM returns registration-token-not-registered
    // Cleaned up by the push worker automatically
    invalid: {
        type: Boolean,
        default: false,
        index: true,
    },

}, {
    timestamps: true,
    collection: 'fcm_tokens',
});

// Compound index — find all valid tokens for a user fast
FcmTokenSchema.index({ userid: 1, invalid: 1 });

// TTL: auto-remove tokens that haven't been active for 90 days
FcmTokenSchema.index(
    { lastActiveAt: 1 },
    { expireAfterSeconds: 90 * 24 * 60 * 60 }  // 90 days
);

module.exports = mongoose.model('FcmToken', FcmTokenSchema);
