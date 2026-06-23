const EmailTemplate = require('../models/email/EmailTemplate');
const { sendEmail } = require('../config/mail/nodemailer');
const { v4: uuidv4 } = require('uuid');
const { createAuditLog } = require('../utils/auditLogger');
const { generateTemplateHtml } = require('../config/mail/templates/templateGenerator');
const path = require('path');
const fs = require('fs');
const { typeFromDbSlug, renderByCategory, formatLocation } = require('../../crafted_climate_email_templates');

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
        const formattedVars = { ...variables };
        if (formattedVars.location) {
            formattedVars.location = formatLocation(formattedVars.location);
        }

        const type = typeFromDbSlug(slug);
        if (type) {
            const allVariables = {
                platformName: 'CraftedClimate',
                supportEmail: process.env.SUPPORT_EMAIL || 'support@craftedclimate.org',
                currentYear: new Date().getFullYear(),
                appUrl: process.env.APP_URL || 'https://console.craftedclimate.co',
                ...formattedVars
            };

            const rendered = renderByCategory(type, allVariables);

            try {
                const template = await EmailTemplate.findOne({ slug });
                if (template) {
                    template.lastUsedAt = new Date();
                    template.usageCount += 1;
                    await template.save();
                }
            } catch (_) {}

            return {
                subject: rendered.subject,
                htmlBody: rendered.html,
                textBody: this._htmlToText(rendered.html)
            };
        }

        const template = await this.getTemplate(slug);

        // Add default variables
        const allVariables = {
            platformName: 'CraftedClimate',
            supportEmail: process.env.SUPPORT_EMAIL || 'support@craftedclimate.org',
            currentYear: new Date().getFullYear(),
            appUrl: process.env.APP_URL || 'https://console.craftedclimate.co',
            ...formattedVars
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
        const formattedVars = { ...variables };
        if (formattedVars.location) {
            formattedVars.location = formatLocation(formattedVars.location);
        }

        const type = typeFromDbSlug(slug);
        if (type) {
            const { sendCCEmail } = require('./email/craftedClimateMailer');
            await sendCCEmail({
                type,
                to,
                vars: formattedVars
            });
            return {
                success: true,
                to,
                template: slug
            };
        }

        const rendered = await this.renderTemplate(slug, formattedVars);

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
        const formattedVars = { ...variables };
        if (formattedVars.location) {
            formattedVars.location = formatLocation(formattedVars.location);
        }

        const type = typeFromDbSlug(slug);
        if (type) {
            const { createEmailPayload } = require('../../crafted_climate_email_templates');
            const { sendPayload } = require('../config/mail/nodemailer');
            const payload = createEmailPayload({ type, to, vars: formattedVars });
            payload.subject = `[TEST] ${payload.subject}`;
            await sendPayload(payload);
            return {
                success: true,
                message: `Test email sent to ${to}`
            };
        }

        const rendered = await this.renderTemplate(slug, formattedVars);

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
     * Initialize default email templates.
     *
     * Behaviour:
     * - If a template does NOT exist → create it.
     * - If it DOES exist → force-update htmlBody and subject so design changes
     *   are always applied (safe: template slugs are stable identifiers).
     */
    async initializeDefaults() {
        // ── 1. WARNING — device offline (first threshold) ─────────────────────
        const warningBody = `
            <p>Hi there,</p>
            <p>
                Your sensor <strong>{{nickname}}</strong> has not reported data for
                <strong>{{durationFormatted}}</strong> and appears to be offline.
                This may indicate a power disruption, connectivity issue, or hardware fault.
            </p>

            <div class="info-box">
                <div class="info-row">
                    <span class="info-label">Device</span>
                    <span class="info-value">{{nickname}} ({{devid}})</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Last Seen</span>
                    <span class="info-value">{{lastSeen}}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Location</span>
                    <span class="info-value">{{location}}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Duration Offline</span>
                    <span class="info-value">{{durationFormatted}}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Batch Health</span>
                    <span class="info-value">{{batchHealth}}</span>
                </div>
            </div>

            <hr class="divider">
            <p class="muted">
                Please check the device's power source and network connection.
                If the issue persists, visit your dashboard to review telemetry history.
            </p>
        `;

        // ── 2. CRITICAL — extended outage ─────────────────────────────────────
        const criticalBody = `
            <p>
                <strong>Action required.</strong> Your sensor <strong>{{nickname}}</strong>
                has been offline for <strong>{{durationFormatted}}</strong>.
                Extended downtime risks data gaps that may affect reporting integrity.
            </p>

            <div class="info-box">
                <div class="info-row">
                    <span class="info-label">Device</span>
                    <span class="info-value">{{nickname}} ({{devid}})</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Last Seen</span>
                    <span class="info-value">{{lastSeen}}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Location</span>
                    <span class="info-value">{{location}}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Duration Offline</span>
                    <span class="info-value" style="color: #C0392B; font-weight: 700;">{{durationFormatted}}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Batch Health</span>
                    <span class="info-value">{{batchHealth}}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Device Model</span>
                    <span class="info-value">{{deviceModel}}</span>
                </div>
            </div>

            <hr class="divider">
            <p>
                Please inspect the device on-site and verify power supply, SIM connectivity,
                and antenna condition. If you are unable to reach the device, contact our
                support team for remote diagnostics.
            </p>
            <p class="muted">
                This is escalation level 2 of 3. A severe outage alert will follow
                if the device remains offline.
            </p>
        `;

        // ── 3. SEVERE — 20× threshold offline ────────────────────────────────
        const severeBody = `
            <p>
                <strong style="color: #B71C1C;">Immediate action required.</strong>
                Your sensor <strong>{{nickname}}</strong> has been completely offline for
                <strong>{{durationFormatted}}</strong>.
                This constitutes a severe data outage that may compromise
                monitoring period completeness and MRV reporting.
            </p>

            <div class="info-box">
                <div class="info-row">
                    <span class="info-label">Device</span>
                    <span class="info-value">{{nickname}} ({{devid}})</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Last Seen</span>
                    <span class="info-value">{{lastSeen}}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Location</span>
                    <span class="info-value">{{location}}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Total Downtime</span>
                    <span class="info-value" style="color: #B71C1C; font-weight: 700;">{{durationFormatted}}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Batch Health</span>
                    <span class="info-value">{{batchHealth}}</span>
                </div>
            </div>

            <hr class="divider">
            <p>
                If the device cannot be restored remotely, physical intervention is required.
                Please contact the CraftedClimate support team for escalated assistance:
                <a href="mailto:{{supportEmail}}">{{supportEmail}}</a>
            </p>
            <p class="muted">
                This is escalation level 3 of 3 — the highest severity alert.
                Further alerts for this device have been suppressed until it recovers.
            </p>
        `;

        // ── 4. WELCOME EMAIL ─────────────────────────────────────────────────
        const welcomeBody = `
            <p>Hi <strong>{{userName}}</strong>,</p>
            <p>
                Welcome to <strong>CraftedClimate</strong> — the environmental intelligence
                platform built for rigorous, transparent, and verifiable climate impact measurement.
            </p>
            <p>Here's what you can do right away:</p>

            <div class="info-box">
                <div class="info-row">
                    <span class="info-label">Register a Sensor</span>
                    <span class="info-value">Connect your first IoT device</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Create a Project</span>
                    <span class="info-value">Set up MRV monitoring projects</span>
                </div>
                <div class="info-row">
                    <span class="info-label">View Telemetry</span>
                    <span class="info-value">Monitor real-time sensor data</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Generate Reports</span>
                    <span class="info-value">Produce audit-ready MRV outputs</span>
                </div>
            </div>

            <hr class="divider">
            <p>
                If you have any questions, our team is ready to help at
                <a href="mailto:{{supportEmail}}">{{supportEmail}}</a>.
            </p>
            <p class="muted">
                You are receiving this because you created a CraftedClimate account.
            </p>
        `;

        // ── 5. PASSWORD RESET (admin-forced) ─────────────────────────────────
        const passwordResetBody = `
            <p>Hi <strong>{{userName}}</strong>,</p>
            <p>
                An administrator has initiated a password reset for your CraftedClimate account.
                Use the link below to set a new password. This link is valid for
                <strong>{{expiryHours}} hours</strong>.
            </p>

            <div class="info-box">
                <div class="info-row">
                    <span class="info-label">Account</span>
                    <span class="info-value">{{userName}}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Link Expires</span>
                    <span class="info-value">In {{expiryHours}} hours</span>
                </div>
            </div>

            <hr class="divider">
            <p class="muted">
                If you did not request this reset, contact support immediately at
                <a href="mailto:{{supportEmail}}">{{supportEmail}}</a>.
                Do not share this link with anyone.
            </p>
        `;

        // ── 6. SUBSCRIPTION EXPIRY REMINDER ──────────────────────────────────
        const expiryReminderBody = `
            <p>Hi <strong>{{userName}}</strong>,</p>
            <p>
                Your <strong>{{planName}}</strong> subscription will expire in
                <strong>{{daysUntilExpiry}} day{{dayPlural}}</strong>.
                Renew now to avoid any interruption to your monitoring and MRV workflows.
            </p>

            <div class="info-box">
                <div class="info-row">
                    <span class="info-label">Current Plan</span>
                    <span class="info-value">{{planName}}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Expires On</span>
                    <span class="info-value">{{expiryDate}}</span>
                </div>
            </div>

            <hr class="divider">
            <p class="muted">
                After expiry a 3-day grace period begins before your account is downgraded to freemium.
            </p>
        `;

        // ── 7. GRACE PERIOD STARTED ───────────────────────────────────────────
        const gracePeriodStartBody = `
            <p>Hi <strong>{{userName}}</strong>,</p>
            <p>
                Your <strong>{{planName}}</strong> subscription has expired.
                We've activated a <strong>3-day grace period</strong> so you can renew without
                losing access to your sensors, MRV projects, and reports.
            </p>

            <div class="info-box">
                <div class="info-row">
                    <span class="info-label">Grace Period Ends</span>
                    <span class="info-value" style="color: #C0392B; font-weight: 700;">{{gracePeriodEnd}}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Previous Plan</span>
                    <span class="info-value">{{planName}}</span>
                </div>
            </div>

            <hr class="divider">
            <p class="muted">
                If you do not renew before {{gracePeriodEnd}}, your account will be automatically
                downgraded to the Freemium plan and excess devices will be disabled.
            </p>
        `;

        // ── 8. GRACE PERIOD REMINDER ──────────────────────────────────────────
        const gracePeriodReminderBody = `
            <p>Hi <strong>{{userName}}</strong>,</p>
            <p>
                You have <strong>{{daysRemaining}} day{{dayPlural}} remaining</strong> in your grace period.
                Renew your <strong>{{planName}}</strong> subscription now to keep full access.
            </p>

            <div class="info-box">
                <div class="info-row">
                    <span class="info-label">Grace Period Ends</span>
                    <span class="info-value" style="color: #B71C1C; font-weight: 700;">{{gracePeriodEnd}}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Plan to Renew</span>
                    <span class="info-value">{{planName}}</span>
                </div>
            </div>

            <hr class="divider">
            <p class="muted">
                After the grace period ends your account will be downgraded to Freemium
                and devices over the free-tier limit will be suspended.
            </p>
        `;

        // ── 9. ACCOUNT DOWNGRADED TO FREEMIUM ────────────────────────────────
        const downgradedBody = `
            <p>Hi <strong>{{userName}}</strong>,</p>
            <p>
                Your grace period has ended and your account has been downgraded from
                <strong>{{oldPlanName}}</strong> to the <strong>Freemium Plan</strong>.
            </p>

            <div class="info-box">
                <div class="info-row">
                    <span class="info-label">Previous Plan</span>
                    <span class="info-value">{{oldPlanName}}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Current Plan</span>
                    <span class="info-value">Freemium</span>
                </div>
            </div>

            <hr class="divider">
            <p>
                You can still use CraftedClimate with free-tier features. Upgrade anytime
                to restore full access to your sensors, MRV projects, and analytics.
            </p>
            <p class="muted">
                If excess devices were active, they have been suspended to comply with
                the Freemium device limit. Renewing will restore them automatically.
            </p>
        `;

        const defaults = [
            {
                name:     'Device Offline: Warning',
                slug:     'device-offline-warning',
                subject:  'Sensor Alert: {{nickname}} has been offline for {{durationFormatted}}',
                category: 'alerts',
                htmlBody: generateTemplateHtml(
                    'Sensor Offline — Warning',
                    warningBody,
                    'View Device Dashboard',
                    '{{dashboardUrl}}'
                ),
                variables: [
                    { name: 'nickname',          required: true  },
                    { name: 'devid',             required: true  },
                    { name: 'lastSeen',          required: true  },
                    { name: 'location',          required: false },
                    { name: 'durationFormatted', required: false },
                    { name: 'minutesOffline',    required: false },
                    { name: 'batchHealth',       required: false },
                    { name: 'dashboardUrl',      required: false },
                ]
            },
            {
                name:     'Device Offline: Critical',
                slug:     'device-offline-critical',
                subject:  'Critical: {{nickname}} offline for {{durationFormatted}} — action required',
                category: 'alerts',
                htmlBody: generateTemplateHtml(
                    'Sensor Offline — Critical',
                    criticalBody,
                    'Inspect Device Now',
                    '{{dashboardUrl}}'
                ),
                variables: [
                    { name: 'nickname',          required: true  },
                    { name: 'devid',             required: true  },
                    { name: 'lastSeen',          required: true  },
                    { name: 'location',          required: false },
                    { name: 'durationFormatted', required: false },
                    { name: 'batchHealth',       required: false },
                    { name: 'deviceModel',       required: false },
                    { name: 'dashboardUrl',      required: false },
                ]
            },
            {
                name:     'Device Offline: Severe',
                slug:     'device-offline-severe',
                subject:  'Severe Outage: {{nickname}} — {{durationFormatted}} without data. Immediate action required.',
                category: 'alerts',
                htmlBody: generateTemplateHtml(
                    'Severe Sensor Outage',
                    severeBody,
                    'Contact Support',
                    '{{supportUrl}}'
                ),
                variables: [
                    { name: 'nickname',          required: true  },
                    { name: 'devid',             required: true  },
                    { name: 'lastSeen',          required: true  },
                    { name: 'location',          required: false },
                    { name: 'durationFormatted', required: false },
                    { name: 'batchHealth',       required: false },
                    { name: 'supportUrl',        required: false },
                ]
            },
            {
                name:     'Welcome Email',
                slug:     'welcome-email',
                subject:  'Welcome to CraftedClimate, {{userName}}',
                category: 'auth',
                htmlBody: generateTemplateHtml(
                    'Welcome to CraftedClimate',
                    welcomeBody,
                    'Go to Dashboard',
                    '{{appUrl}}/dashboard'
                ),
                variables: [
                    { name: 'userName', required: true }
                ]
            },
            // ── NEW: password-reset (admin-forced) ───────────────────────────
            {
                name:     'Password Reset (Admin-Forced)',
                slug:     'password-reset',
                subject:  'Your CraftedClimate password has been reset',
                category: 'auth',
                htmlBody: generateTemplateHtml(
                    'Password Reset Request',
                    passwordResetBody,
                    'Set New Password',
                    '{{resetLink}}'
                ),
                variables: [
                    { name: 'userName',    required: true  },
                    { name: 'resetLink',   required: true  },
                    { name: 'expiryHours', required: false },
                ]
            },
            // ── NEW: subscription-expiry-reminder ────────────────────────────
            {
                name:     'Subscription Expiry Reminder',
                slug:     'subscription-expiry-reminder',
                subject:  'Your {{planName}} subscription expires in {{daysUntilExpiry}} day{{dayPlural}}',
                category: 'subscription',
                htmlBody: generateTemplateHtml(
                    'Subscription Expiring Soon',
                    expiryReminderBody,
                    'Renew Now',
                    '{{renewUrl}}'
                ),
                variables: [
                    { name: 'userName',        required: true  },
                    { name: 'planName',        required: true  },
                    { name: 'daysUntilExpiry', required: true  },
                    { name: 'expiryDate',      required: true  },
                    { name: 'dayPlural',       required: false },
                    { name: 'renewUrl',        required: false },
                ]
            },
            // ── NEW: subscription-grace-start ─────────────────────────────────
            {
                name:     'Subscription Grace Period Started',
                slug:     'subscription-grace-start',
                subject:  'Your {{planName}} subscription has expired — 3-day grace period started',
                category: 'subscription',
                htmlBody: generateTemplateHtml(
                    'Grace Period Active',
                    gracePeriodStartBody,
                    'Renew Now',
                    '{{renewUrl}}'
                ),
                variables: [
                    { name: 'userName',       required: true  },
                    { name: 'planName',       required: true  },
                    { name: 'gracePeriodEnd', required: true  },
                    { name: 'renewUrl',       required: false },
                ]
            },
            // ── NEW: subscription-grace-reminder ──────────────────────────────
            {
                name:     'Subscription Grace Period Reminder',
                slug:     'subscription-grace-reminder',
                subject:  '{{daysRemaining}} day{{dayPlural}} left in your grace period — renew {{planName}} now',
                category: 'subscription',
                htmlBody: generateTemplateHtml(
                    'Grace Period Ending Soon',
                    gracePeriodReminderBody,
                    'Renew Now',
                    '{{renewUrl}}'
                ),
                variables: [
                    { name: 'userName',       required: true  },
                    { name: 'planName',       required: true  },
                    { name: 'daysRemaining',  required: true  },
                    { name: 'gracePeriodEnd', required: true  },
                    { name: 'dayPlural',      required: false },
                    { name: 'renewUrl',       required: false },
                ]
            },
            // ── NEW: subscription-downgraded ──────────────────────────────────
            {
                name:     'Account Downgraded to Freemium',
                slug:     'subscription-downgraded',
                subject:  'Your account has been downgraded to the Freemium plan',
                category: 'subscription',
                htmlBody: generateTemplateHtml(
                    'Account Downgraded',
                    downgradedBody,
                    'Upgrade Now',
                    '{{renewUrl}}'
                ),
                variables: [
                    { name: 'userName',     required: true  },
                    { name: 'oldPlanName',  required: true  },
                    { name: 'renewUrl',     required: false },
                ]
            },
        ];

        for (const template of defaults) {
            const existing = await EmailTemplate.findOne({ slug: template.slug });
            if (!existing) {
                await this.createTemplate(template, 'system');
                console.log(`✅ Created default template: ${template.slug}`);
            } else {
                // Always force-update design changes
                existing.htmlBody = template.htmlBody;
                existing.subject  = template.subject;
                if (template.variables) existing.variables = template.variables;
                await existing.save();
                console.log(`🔄 Updated template: ${template.slug}`);
            }
        }

        console.log('✅ Default email templates initialized');
    }
}

module.exports = new EmailTemplateService();

