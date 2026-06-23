const emailTemplateService = require('../../services/emailTemplate.service');

/**
 * Email Template Controller
 * Admin management of email templates
 */
class EmailTemplateController {

    /**
     * List all templates
     */
    async listTemplates(req, res) {
        try {
            const filters = {
                category: req.query.category,
                active: req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined
            };

            const templates = await emailTemplateService.listTemplates(filters);

            res.status(200).json({
                success: true,
                data: templates
            });
        } catch (error) {
            console.error('[EmailTemplateController] List error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Get template by slug
     */
    async getTemplate(req, res) {
        try {
            const { slug } = req.params;

            const template = await emailTemplateService.getTemplate(slug);

            res.status(200).json({
                success: true,
                data: template
            });
        } catch (error) {
            console.error('[EmailTemplateController] Get error:', error);
            res.status(404).json({ success: false, message: error.message });
        }
    }

    /**
     * Create template
     */
    async createTemplate(req, res) {
        try {
            const adminId = req.user.userid;

            const template = await emailTemplateService.createTemplate(req.body, adminId);

            res.status(201).json({
                success: true,
                message: 'Template created successfully',
                data: template
            });
        } catch (error) {
            console.error('[EmailTemplateController] Create error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Update template
     */
    async updateTemplate(req, res) {
        try {
            const { slug } = req.params;
            const adminId = req.user.userid;

            const template = await emailTemplateService.updateTemplate(slug, req.body, adminId);

            res.status(200).json({
                success: true,
                message: 'Template updated successfully',
                data: template
            });
        } catch (error) {
            console.error('[EmailTemplateController] Update error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Delete template
     */
    async deleteTemplate(req, res) {
        try {
            const { slug } = req.params;
            const adminId = req.user.userid;

            const result = await emailTemplateService.deleteTemplate(slug, adminId);

            res.status(200).json(result);
        } catch (error) {
            console.error('[EmailTemplateController] Delete error:', error);
            res.status(404).json({ success: false, message: error.message });
        }
    }

    /**
     * Preview template
     */
    async previewTemplate(req, res) {
        try {
            const { slug } = req.params;
            const variables = req.body.variables || {};

            const rendered = await emailTemplateService.previewTemplate(slug, variables);

            res.status(200).json({
                success: true,
                data: rendered
            });
        } catch (error) {
            console.error('[EmailTemplateController] Preview error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Send test email
     */
    async sendTestEmail(req, res) {
        try {
            const { slug } = req.params;
            const { to, variables } = req.body;

            if (!to) {
                return res.status(400).json({
                    success: false,
                    message: 'Recipient email (to) is required'
                });
            }

            const result = await emailTemplateService.sendTestEmail(slug, to, variables || {});

            res.status(200).json(result);
        } catch (error) {
            console.error('[EmailTemplateController] Send test error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Get template statistics
     */
    async getStatistics(req, res) {
        try {
            const stats = await emailTemplateService.getTemplateStats();

            res.status(200).json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('[EmailTemplateController] Stats error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Initialize default templates
     */
    async initializeDefaults(req, res) {
        try {
            await emailTemplateService.initializeDefaults();

            res.status(200).json({
                success: true,
                message: 'Default templates initialized'
            });
        } catch (error) {
            console.error('[EmailTemplateController] Initialize error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Send test platform email using the new template engine
     */
    async sendPlatformTestEmail(req, res) {
        try {
            const { to, type, vars = {} } = req.body;

            if (!to || !type) {
                return res.status(400).json({
                    success: false,
                    message: 'Recipient email (to) and template type are required'
                });
            }

            const { sendCCEmail } = require('../../services/email/craftedClimateMailer');
            
            // Build rich mock variables if not explicitly provided
            const mockVars = {
                userName: 'Sylvian Kimkpe',
                firstName: 'Sylvian',
                lastName: 'Kimkpe',
                recipientEmail: to,
                otp: '482913',
                code: '482913',
                expiresIn: '15 minutes',
                context: 'Platform Admin Test',
                dashboardUrl: process.env.APP_URL || 'https://console.craftedclimate.co',
                requestingAdminName: 'Sylvian Kimkpe',
                requestingAdminEmail: 'sylvian@craftedclimate.org',
                requestedAt: new Date().toISOString(),
                ipAddress: '192.168.1.1',
                requestId: 'req-test-999',
                reviewUrl: process.env.APP_URL || 'https://console.craftedclimate.co',
                resetUrl: `${process.env.APP_URL || 'https://console.craftedclimate.co'}/reset-password?token=test-token`,
                resetLink: `${process.env.APP_URL || 'https://console.craftedclimate.co'}/reset-password?token=test-token`,
                reason: 'Platform Administrator forced password reset testing.',
                expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
                expiryHours: '24',
                nickname: 'API-DEVICE',
                devid: '2at1',
                auid: '2at1',
                lastSeen: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
                location: '{"latitude":5.647053560050725,"longitude":-0.1669530199542789,"country":"Ghana","region":"Greater Accra","city":"Accra","street":"2nd Street","municipality":"Accra","municipalitySubdivision":"Ayawaso West"}',
                durationFormatted: '266.5 hours',
                minutesOffline: '15990',
                batchHealth: 'No batch issues detected',
                deviceModel: 'AquaSolo-T1',
                orgName: 'Afrilogic Solutions',
                supportUrl: `${process.env.APP_URL || 'https://console.craftedclimate.co'}/support`,
                title: 'System Notification Test',
                message: 'This is a test notification sent from the platform administration panel to verify template layout and formatting.',
                theme: 'info',
                category: 'System',
                actionUrl: process.env.APP_URL || 'https://console.craftedclimate.co',
                actionLabel: 'Go to Console',
                items: [
                    { type: 'alert', title: 'Sensor Offline Alert', message: 'API-DEVICE has been offline for 4 hours.', timestamp: new Date().toISOString() },
                    { type: 'success', title: 'Verification Approved', message: 'Your business verification has been approved.', timestamp: new Date().toISOString() }
                ],
                frequency: 'daily',
                count: 2,
                notificationsUrl: `${process.env.APP_URL || 'https://console.craftedclimate.co'}/notifications`,
                preferencesUrl: `${process.env.APP_URL || 'https://console.craftedclimate.co'}/notifications/preferences`,
                collaboratorName: 'Sylvian Kimkpe',
                addedBy: 'Admin User',
                permissions: ['telemetry:read', 'devices:read', 'mrv:projects:read'],
                deviceUrl: `${process.env.APP_URL || 'https://console.craftedclimate.co'}/devices/2at1`,
                planName: 'Enterprise Plan',
                oldPlanName: 'Premium Plan',
                expiryDate: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
                daysUntilExpiry: 3,
                daysRemaining: 2,
                dayPlural: 's',
                graceEndsAt: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
                gracePeriodEnd: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
                renewUrl: `${process.env.APP_URL || 'https://console.craftedclimate.co'}/subscriptions`,
                renewalUrl: `${process.env.APP_URL || 'https://console.craftedclimate.co'}/subscriptions`,
                downgradeSummary: 'Your organization has been downgraded to Freemium plan due to payment expiration. Active devices are limited to 1.',
                inviteeName: 'Sylvian Kimkpe',
                inviterName: 'Admin User',
                role: 'org-admin',
                acceptUrl: `${process.env.APP_URL || 'https://console.craftedclimate.co'}/accept-invite`,
                signupUrl: `${process.env.APP_URL || 'https://console.craftedclimate.co'}/signup`,
                isNewUser: true,
                periodName: 'Accra Carbon Capture Phase 1',
                completenessPercent: 82.5,
                alertLevel: 'WARNING',
                projectId: 'proj-123',
                monitoringPeriodId: 'mp-123',
                observations: [
                    { observationId: 'obs-9876', reason: 'Spike in telemetry data' },
                    { observationId: 'obs-9877', reason: 'Zero values detected' }
                ],
                projectName: 'Accra Carbon Capture Phase 1',
                verificationCaseId: 'vc-555',
                deadlineDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
                daysLeft: 7,
                vvbEmail: 'vvb@example.com',
                projectOwnerEmail: 'owner@example.com',
                ...vars
            };

            await sendCCEmail({
                type,
                to,
                vars: mockVars
            });

            res.status(200).json({
                success: true,
                message: `Test email of type '${type}' successfully sent to '${to}'`
            });
        } catch (error) {
            console.error('[EmailTemplateController] sendPlatformTestEmail error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }
}

module.exports = new EmailTemplateController();
