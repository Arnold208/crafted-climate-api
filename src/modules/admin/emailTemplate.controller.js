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
}

module.exports = new EmailTemplateController();
