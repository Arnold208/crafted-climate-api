const mongoose = require('mongoose');

/**
 * Email Template Model
 * Dynamic email templates with variable substitution
 */
const EmailTemplateSchema = new mongoose.Schema({
    templateId: {
        type: String,
        required: true,
        unique: true
    },

    name: {
        type: String,
        required: true,
        maxlength: 100
    },

    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },

    subject: {
        type: String,
        required: true,
        maxlength: 200
    },

    htmlBody: {
        type: String,
        required: true
    },

    textBody: {
        type: String
    },

    // Available variables in template
    variables: [{
        name: String,
        description: String,
        required: Boolean,
        defaultValue: String
    }],

    category: {
        type: String,
        enum: ['auth', 'billing', 'support', 'marketing', 'system', 'notification'],
        required: true
    },

    active: {
        type: Boolean,
        default: true
    },

    // Version control
    version: {
        type: Number,
        default: 1
    },

    // Metadata
    createdBy: {
        type: String,
        required: true
    },

    updatedBy: {
        type: String
    },

    lastUsedAt: {
        type: Date
    },

    usageCount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true,
    collection: 'emailtemplates'
});

// Indexes
EmailTemplateSchema.index({ slug: 1, active: 1 });
EmailTemplateSchema.index({ category: 1 });

// Auto-generate slug from name if not provided
EmailTemplateSchema.pre('save', function (next) {
    if (!this.slug && this.name) {
        this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    }
    next();
});

module.exports = mongoose.model('EmailTemplate', EmailTemplateSchema);
