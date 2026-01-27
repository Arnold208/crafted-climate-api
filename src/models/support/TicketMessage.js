const mongoose = require('mongoose');

/**
 * Ticket Message Model
 * Threaded conversation for support tickets
 */
const TicketMessageSchema = new mongoose.Schema({
    messageId: {
        type: String,
        required: true,
        unique: true
    },

    ticketId: {
        type: String,
        required: true,
        index: true
    },

    userid: {
        type: String,
        required: true
    },

    // User info (denormalized for display)
    userInfo: {
        email: String,
        name: String,
        role: String // 'customer' or 'admin'
    },

    message: {
        type: String,
        required: true,
        maxlength: 10000
    },

    // Internal notes (admin-only, not visible to customer)
    isInternal: {
        type: Boolean,
        default: false
    },

    // Attachments
    attachments: [{
        filename: String,
        url: String,
        size: Number,
        mimeType: String
    }],

    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: false,
    collection: 'ticketmessages'
});

// Indexes
TicketMessageSchema.index({ ticketId: 1, createdAt: 1 });
TicketMessageSchema.index({ userid: 1 });

module.exports = mongoose.model('TicketMessage', TicketMessageSchema);
