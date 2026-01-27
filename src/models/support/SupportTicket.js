const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * Support Ticket Model
 * Customer support ticket management
 */
const SupportTicketSchema = new mongoose.Schema({
    ticketId: {
        type: String,
        required: true,
        unique: true,
        default: () => `TKT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`
    },

    organizationId: {
        type: String,
        required: true,
        index: true
    },

    userid: {
        type: String,
        required: true,
        index: true
    },

    subject: {
        type: String,
        required: true,
        maxlength: 200
    },

    description: {
        type: String,
        required: true,
        maxlength: 5000
    },

    status: {
        type: String,
        enum: ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'],
        default: 'open',
        index: true
    },

    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium',
        index: true
    },

    category: {
        type: String,
        enum: ['technical', 'billing', 'feature_request', 'bug', 'account', 'other'],
        default: 'other'
    },

    // Assignment
    assignedTo: {
        type: String, // admin userid
        default: null
    },

    assignedAt: {
        type: Date
    },

    // Tags for organization
    tags: [String],

    // SLA tracking
    sla: {
        firstResponseTime: {
            type: Number, // minutes
            default: null
        },
        firstResponseDue: {
            type: Date
        },
        resolutionTime: {
            type: Number, // minutes
            default: null
        },
        resolutionDue: {
            type: Date
        },
        breached: {
            type: Boolean,
            default: false
        }
    },

    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },

    updatedAt: {
        type: Date,
        default: Date.now
    },

    firstResponseAt: {
        type: Date
    },

    resolvedAt: {
        type: Date
    },

    closedAt: {
        type: Date
    },

    // Metadata
    metadata: {
        userAgent: String,
        ipAddress: String,
        platform: String
    }
}, {
    timestamps: true,
    collection: 'supporttickets'
});

// Indexes for efficient queries
SupportTicketSchema.index({ organizationId: 1, status: 1 });
SupportTicketSchema.index({ userid: 1, status: 1 });
SupportTicketSchema.index({ assignedTo: 1, status: 1 });
SupportTicketSchema.index({ priority: 1, status: 1 });
SupportTicketSchema.index({ createdAt: -1 });

// Calculate SLA due dates based on priority
SupportTicketSchema.methods.calculateSLA = function () {
    const now = new Date();

    // SLA targets in minutes
    const slaTargets = {
        urgent: { firstResponse: 60, resolution: 240 },      // 1h, 4h
        high: { firstResponse: 240, resolution: 1440 },      // 4h, 24h
        medium: { firstResponse: 1440, resolution: 4320 },   // 24h, 3 days
        low: { firstResponse: 2880, resolution: 10080 }      // 2 days, 7 days
    };

    const target = slaTargets[this.priority];

    this.sla.firstResponseDue = new Date(now.getTime() + target.firstResponse * 60000);
    this.sla.resolutionDue = new Date(now.getTime() + target.resolution * 60000);
};

// Check if SLA is breached
SupportTicketSchema.methods.checkSLABreach = function () {
    const now = new Date();

    if (!this.firstResponseAt && this.sla.firstResponseDue && now > this.sla.firstResponseDue) {
        this.sla.breached = true;
    }

    if (!this.resolvedAt && this.sla.resolutionDue && now > this.sla.resolutionDue) {
        this.sla.breached = true;
    }
};

// Pre-save middleware
SupportTicketSchema.pre('save', function (next) {
    this.updatedAt = new Date();

    // Calculate SLA on creation
    if (this.isNew) {
        this.calculateSLA();
    }

    // Check SLA breach
    this.checkSLABreach();

    next();
});

module.exports = mongoose.model('SupportTicket', SupportTicketSchema);
