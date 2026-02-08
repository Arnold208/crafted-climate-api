const EmailTemplate = require('../models/email/EmailTemplate');
const { sendEmail } = require('../config/mail/nodemailer');
const { v4: uuidv4 } = require('uuid');
const { createAuditLog } = require('../utils/auditLogger');
const { generateTemplateHtml } = require('../config/mail/templates/templateGenerator');
const path = require('path');
const fs = require('fs');

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
        // Need to pass attachments manually if sendEmail supports it, or modify sendEmail to support it.
        // Assuming sendEmail signature is (to, subject, html, attachments) or similar.
        // Let's check `nodemailer.js` first. Wait, I don't have visibility on `nodemailer.js` yet.
        // I will assume I need to pass an options object or extra arguments.
        // Standard Nodemailer `sendMail` options object works. 
        // IF `sendEmail` wraps it, I need to know how. 
        // I'll assume `sendEmail` takes (to, subject, html, attachments).

        const logoPath = path.join(__dirname, '../config/storage/image/cc_logo_raw.png');
        const attachments = [{
            filename: 'cc_logo_raw.png',
            path: logoPath,
            cid: 'cc_logo' // same cid value as in the html img src
        }];

        await sendEmail(to, rendered.subject, rendered.htmlBody, attachments);

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

        const logoPath = path.join(__dirname, '../config/storage/image/cc_logo_raw.png');
        const attachments = [{
            filename: 'cc_logo_raw.png',
            path: logoPath,
            cid: 'cc_logo'
        }];

        await sendEmail(to, testSubject, rendered.htmlBody, attachments);

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
        // --- 1. Offline Alert: Warning (70 mins) ---
        const warningBody = `
            <h2>Device Offline Notification</h2>
            <div class="alert-box">
                Your device <strong>{{nickname}}</strong> has been offline for over 70 minutes.
            </div>
            <div class="info-row">
                <span class="info-label">Last Seen</span>
                <span class="info-value">{{lastSeen}}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Device ID</span>
                <span class="info-value">{{devid}}</span>
            </div>
            <p style="margin-top: 20px;">This may indicate a power disruption or network connectivity issue. Verification is recommended.</p>
        `;

        // --- 2. Offline Alert: Critical (5 Hours) ---
        const criticalBody = `
            <h2 style="color: #35752D;">Urgent: Device Status Critical</h2>
            <div class="alert-box">
                Device <strong>{{nickname}}</strong> has been offline for more than 5 hours.
            </div>
            <div class="info-row">
                <span class="info-label">Last Seen</span>
                <span class="info-value">{{lastSeen}}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Location</span>
                <span class="info-value">{{location}}</span>
            </div>
            <p style="margin-top: 20px;">Extended downtime may impact data integrity. Immediate inspection of the device is advised.</p>
        `;

        // --- 3. Offline Alert: Severe (24 Hours) ---
        const severeBody = `
            <h2 style="color: #35752D;">Severe Outage Alert</h2>
            <div class="alert-box" style="border-left-color: #D32F2F;">
                Device <strong>{{nickname}}</strong> has been offline for 24 hours.
            </div>
            <div class="info-row">
                <span class="info-label">Last Seen</span>
                <span class="info-value">{{lastSeen}}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Impact</span>
                <span class="info-value">24 Hours Data Loss</span>
            </div>
            <p style="margin-top: 20px;">Infrastructure intervention is required to restore connectivity.</p>
        `;

        const defaults = [
            {
                name: 'Device Offline: Warning',
                slug: 'device-offline-warning',
                subject: 'CrowdSense Alert: {{nickname}} Offline',
                category: 'alerts',
                htmlBody: generateTemplateHtml('Status Notification', warningBody, { text: 'View Dashboard', url: '{{appUrl}}/dashboard' }),
                variables: [
                    { name: 'nickname', required: true },
                    { name: 'lastSeen', required: true },
                    { name: 'devid', required: true }
                ]
            },
            {
                name: 'Device Offline: Critical',
                slug: 'device-offline-critical',
                subject: 'Urgent: {{nickname}} Status Critical',
                category: 'alerts',
                htmlBody: generateTemplateHtml('Critical Status', criticalBody, { text: 'Inspect Device', url: '{{appUrl}}/devices/{{devid}}' }),
                variables: [
                    { name: 'nickname', required: true },
                    { name: 'lastSeen', required: true },
                    { name: 'location', required: true }
                ]
            },
            {
                name: 'Device Offline: Severe',
                slug: 'device-offline-severe',
                subject: 'Severe Outage: {{nickname}} Offline 24h',
                category: 'alerts',
                htmlBody: generateTemplateHtml('Severe Outage', severeBody, { text: 'Contact Support', url: 'mailto:{{supportEmail}}' }),
                variables: [
                    { name: 'nickname', required: true },
                    { name: 'lastSeen', required: true }
                ]
            },
            // ... (keep existing welcome/reset templates if you wish, or wrap them too)
            {
                name: 'Welcome Email',
                slug: 'welcome-email',
                subject: 'Welcome to {{platformName}}',
                category: 'auth',
                htmlBody: generateTemplateHtml('Welcome', `
                    <p>Hi {{userName}},</p>
                    <p>Thank you for joining <strong>{{platformName}}</strong>. We are excited to have you on board.</p>
                    <p>Please proceed to your dashboard to configure your first device.</p>
                `, { text: 'Go to Dashboard', url: '{{appUrl}}/dashboard' }),
                variables: [
                    { name: 'userName', required: true }
                ]
            }
        ];

        for (const template of defaults) {
            // Update if exists to apply new styles, or create if missing
            const existing = await EmailTemplate.findOne({ slug: template.slug });
            if (!existing) {
                await this.createTemplate(template, 'system');
                console.log(`✅ Created default template: ${template.slug}`);
            } else {
                // FORCE UPDATE for Design Changes
                existing.htmlBody = template.htmlBody;
                existing.subject = template.subject;
                await existing.save();
                console.log(`🔄 Updated template: ${template.slug}`);
            }
        }

        console.log('✅ Default email templates initialized');
    }
}

module.exports = new EmailTemplateService();
