const mongoose = require('mongoose');

/**
 * Client / Project Model
 * ======================
 * Represents an external client or project that an Organization is managing.
 * Fulfills Platform Hardening Requirement #6.
 */
const clientSchema = new mongoose.Schema({
    clientId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    organizationId: {
        type: String,
        required: true,
        index: true
    },

    name: {
        type: String,
        required: true
    },

    description: {
        type: String,
        default: ''
    },

    contactEmail: {
        type: String,
        default: null
    },

    contactPhone: {
        type: String,
        default: null
    },

    /**
     * Optional physical address or location metadata
     */
    location: {
        type: Object,
        default: {}
    },

    /**
     * Linked deployments (Fleets) usually belong to a client
     */
    deploymentIds: {
        type: [String],
        default: []
    },

    createdBy: {
        type: String, // userid
        required: true
    },

    createdAt: {
        type: Date,
        default: Date.now
    },

    updatedAt: {
        type: Date,
        default: Date.now
    },

    /** Platform Hardening: Data Safety */
    deletedAt: {
        type: Date,
        default: null,
        index: true
    }
});

// Update `updatedAt` on save
clientSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('Client', clientSchema);
