const EmailTemplate = require('../models/email/EmailTemplate');
const { sendEmail } = require('../config/mail/nodemailer');
const { v4: uuidv4 } = require('uuid');
const { createAuditLog } = require('../utils/auditLogger');

/**
 * Email Template Service
 * Manage and render dynamic email templates
 */
class EmailTemplateService {

    /**
     * Create email template
     */
    async createTemplate(data, createdBy) {
        const { name, slug, subject, htmlBody, textBody, variables, category } = data;

        const template = new EmailTemplate({
            templateId: uuidv4(),
            name,
            slug,
            subject,
            htmlBody,
            textBody,
            variables: variables || [],
            category,
            createdBy
        });

        await template.save();

        // Audit log
        await createAuditLog({
            action: 'EMAIL_TEMPLATE_CREATED',
            userid: createdBy,
            details: { templateId: template.templateId, slug: template.slug },
            ipAddress: null
        });

        return template;
    }

    /**
     * List templates
     */
    async listTemplates(filters = {}) {
        const { category, active } = filters;

        const query = {};
        if (category) query.category = category;
        if (active !== undefined) query.active = active;

        const templates = await EmailTemplate.find(query)
            .sort({ category: 1, name: 1 })
            .lean();

        return templates;
    }

    /**
     * Get template by slug
     */
    async getTemplate(slug) {
        const template = await EmailTemplate.findOne({ slug, active: true });

        if (!template) {
            throw new Error(`Template '${slug}' not found`);
        }

        return template;
    }

    /**
     * Update template
     */
    async updateTemplate(slug, updates, updatedBy) {
        const template = await EmailTemplate.findOne({ slug });

        if (!template) {
            throw new Error(`Template '${slug}' not found`);
        }

        // Update fields
        if (updates.name) template.name = updates.name;
        if (updates.subject) template.subject = updates.subject;
        if (updates.htmlBody) template.htmlBody = updates.htmlBody;
        if (updates.textBody !== undefined) template.textBody = updates.textBody;
        if (updates.variables) template.variables = updates.variables;
        if (updates.active !== undefined) template.active = updates.active;

        // Increment version
        template.version += 1;
        template.updatedBy = updatedBy;

        await template.save();

        // Audit log
        await createAuditLog({
            action: 'EMAIL_TEMPLATE_UPDATED',
            userid: updatedBy,
            details: { templateId: template.templateId, slug, version: template.version },
            ipAddress: null
        });

        return template;
    }

    /**
     * Delete template
     */
    async deleteTemplate(slug, deletedBy) {
        const template = await EmailTemplate.findOne({ slug });

        if (!template) {
            throw new Error(`Template '${slug}' not found`);
        }

        await EmailTemplate.deleteOne({ slug });

        // Audit log
        await createAuditLog({
            action: 'EMAIL_TEMPLATE_DELETED',
            userid: deletedBy,
            details: { templateId: template.templateId, slug },
            ipAddress: null
        });

        return { success: true, message: 'Template deleted' };
    }

    /**
     * Render template with variables
     */
    async renderTemplate(slug, variables = {}) {
        const template = await this.getTemplate(slug);

        // Add default variables
        const allVariables = {
            platformName: 'CraftedClimate',
            supportEmail: process.env.SUPPORT_EMAIL || 'support@craftedclimate.com',
            currentYear: new Date().getFullYear(),
            appUrl: process.env.APP_URL || 'https://app.craftedclimate.com',
            ...variables
        };

        // Render subject
        let subject = template.subject;
        for (const [key, value] of Object.entries(allVariables)) {
            const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
            subject = subject.replace(regex, value || '');
        }

        // Render HTML body
        let htmlBody = template.htmlBody;
        for (const [key, value] of Object.entries(allVariables)) {
            const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
            htmlBody = htmlBody.replace(regex, value || '');
        }

        // Render text body
        let textBody = template.textBody || this._htmlToText(htmlBody);
        for (const [key, value] of Object.entries(allVariables)) {
            const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
            textBody = textBody.replace(regex, value || '');
        }

        // Update usage stats
        template.lastUsedAt = new Date();
        template.usageCount += 1;
        await template.save();

        return {
            subject,
            htmlBody,
            textBody
        };
    }

    /**
     * Send email using template
     */
    async sendFromTemplate(slug, to, variables = {}) {
        const rendered = await this.renderTemplate(slug, variables);

        // Use existing Nodemailer sendEmail function
        await sendEmail(to, rendered.subject, rendered.htmlBody);

        return {
            success: true,
            to,
            template: slug
        };
    }

    /**
     * Preview template (render without sending)
     */
    async previewTemplate(slug, variables = {}) {
        return this.renderTemplate(slug, variables);
    }

    /**
     * Send test email
     */
    async sendTestEmail(slug, to, variables = {}) {
        const rendered = await this.renderTemplate(slug, variables);

        // Add test prefix to subject
        const testSubject = `[TEST] ${rendered.subject}`;

        await sendEmail(to, testSubject, rendered.htmlBody);

        return {
            success: true,
            message: `Test email sent to ${to}`
        };
    }

    /**
     * Get template statistics
     */
    async getTemplateStats() {
        const [total, byCategory, mostUsed] = await Promise.all([
            EmailTemplate.countDocuments({ active: true }),
            EmailTemplate.aggregate([
                { $match: { active: true } },
                { $group: { _id: '$category', count: { $sum: 1 } } }
            ]),
            EmailTemplate.find({ active: true })
                .sort({ usageCount: -1 })
                .limit(10)
                .select('slug name usageCount lastUsedAt')
                .lean()
        ]);

        return {
            total,
            byCategory,
            mostUsed
        };
    }

    /**
     * Convert HTML to plain text (basic)
     */
    _htmlToText(html) {
        return html
            .replace(/<style[^>]*>.*?<\/style>/gi, '')
            .replace(/<script[^>]*>.*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Initialize default templates
     */
    async initializeDefaults() {
        const defaults = [
            {
                name: 'Welcome Email',
                slug: 'welcome-email',
                subject: 'Welcome to {{platformName}}!',
                category: 'auth',
                htmlBody: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h1 style="color: #3b82f6;">Welcome to {{platformName}}!</h1>
    <p>Hi {{userName}},</p>
    <p>Thank you for joining {{platformName}}. We're excited to have you on board!</p>
    <p>Get started by exploring your dashboard:</p>
    <div style="text-align: center; margin: 30px 0;">
        <a href="{{appUrl}}/dashboard" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">Go to Dashboard</a>
    </div>
    <p>If you have any questions, feel free to reach out to us at {{supportEmail}}.</p>
    <p>Best regards,<br>The {{platformName}} Team</p>
</div>
                `.trim(),
                variables: [
                    { name: 'userName', description: 'User\'s name', required: true },
                    { name: 'userEmail', description: 'User\'s email', required: true }
                ]
            },
            {
                name: 'Password Reset',
                slug: 'password-reset',
                subject: 'Reset your {{platformName}} password',
                category: 'auth',
                htmlBody: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h1 style="color: #3b82f6;">Reset Your Password</h1>
    <p>Hi {{userName}},</p>
    <p>We received a request to reset your password. Click the button below to create a new password:</p>
    <div style="text-align: center; margin: 30px 0;">
        <a href="{{resetLink}}" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
    </div>
    <p>This link will expire in {{expiryHours}} hours.</p>
    <p>If you didn't request this, please ignore this email.</p>
    <p>Best regards,<br>The {{platformName}} Team</p>
</div>
                `.trim(),
                variables: [
                    { name: 'userName', description: 'User\'s name', required: true },
                    { name: 'resetLink', description: 'Password reset link', required: true },
                    { name: 'expiryHours', description: 'Link expiry time', required: false, defaultValue: '24' }
                ]
            },
            {
                name: 'Subscription Confirmation',
                slug: 'subscription-confirmation',
                subject: 'Your {{platformName}} subscription is confirmed',
                category: 'billing',
                htmlBody: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h1 style="color: #10b981;">Subscription Confirmed!</h1>
    <p>Hi {{userName}},</p>
    <p>Your subscription to the <strong>{{planName}}</strong> plan has been confirmed.</p>
    <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Plan:</strong> {{planName}}</p>
        <p><strong>Amount:</strong> ${{ amount }}</p>
        <p><strong>Billing Cycle:</strong> {{billingCycle}}</p>
        <p><strong>Next Billing Date:</strong> {{nextBillingDate}}</p>
    </div>
    <p>Thank you for your subscription!</p>
    <p>Best regards,<br>The {{platformName}} Team</p>
</div>
                `.trim(),
                variables: [
                    { name: 'userName', description: 'User\'s name', required: true },
                    { name: 'planName', description: 'Subscription plan name', required: true },
                    { name: 'amount', description: 'Subscription amount', required: true },
                    { name: 'billingCycle', description: 'Billing cycle', required: true },
                    { name: 'nextBillingDate', description: 'Next billing date', required: true }
                ]
            }
        ];

        for (const template of defaults) {
            const exists = await EmailTemplate.findOne({ slug: template.slug });
            if (!exists) {
                await this.createTemplate(template, 'system');
                console.log(`✅ Created default template: ${template.slug}`);
            }
        }

        console.log('✅ Default email templates initialized');
    }
}

module.exports = new EmailTemplateService();
