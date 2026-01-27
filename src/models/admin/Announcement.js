const mongoose = require('mongoose');

/**
 * Platform Announcement Model
 * Admin-created announcements for all users
 */
const AnnouncementSchema = new mongoose.Schema({
    announcementId: {
        type: String,
        required: true,
        unique: true
    },

    title: {
        type: String,
        required: true,
        maxlength: 200
    },

    message: {
        type: String,
        required: true,
        maxlength: 2000
    },

    type: {
        type: String,
        enum: ['info', 'warning', 'success', 'error', 'maintenance'],
        default: 'info'
    },

    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },

    // Display settings
    active: {
        type: Boolean,
        default: true
    },

    startDate: {
        type: Date,
        default: Date.now
    },

    endDate: {
        type: Date
    },

    // Targeting
    targetAudience: {
        type: String,
        enum: ['all', 'admins', 'users', 'organizations'],
        default: 'all'
    },

    // Metadata
    createdBy: {
        type: String,
        required: true
    },

    viewCount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true,
    collection: 'announcements'
});

module.exports = mongoose.model('Announcement', AnnouncementSchema);
