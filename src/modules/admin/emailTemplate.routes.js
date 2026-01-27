const express = require('express');
const router = express.Router();
const emailTemplateController = require('./emailTemplate.controller');
const authenticateToken = require('../../middleware/bearermiddleware');
const requirePlatformAdmin = require('../../middleware/requirePlatformAdmin');

/**
 * @swagger
 * /api/admin/email-templates:
 *   get:
 *     tags: [Email Templates]
 *     summary: List all email templates
 *     description: Get all email templates (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [auth, billing, support, marketing, system, notification]
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Templates retrieved
 */
router.get('/', authenticateToken, requirePlatformAdmin, emailTemplateController.listTemplates);

/**
 * @swagger
 * /api/admin/email-templates/{slug}:
 *   get:
 *     tags: [Email Templates]
 *     summary: Get template by slug
 *     description: View template details (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Template retrieved
 */
router.get('/:slug', authenticateToken, requirePlatformAdmin, emailTemplateController.getTemplate);

/**
 * @swagger
 * /api/admin/email-templates:
 *   post:
 *     tags: [Email Templates]
 *     summary: Create email template
 *     description: Create new email template (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - subject
 *               - htmlBody
 *               - category
 *             properties:
 *               name:
 *                 type: string
 *               slug:
 *                 type: string
 *               subject:
 *                 type: string
 *               htmlBody:
 *                 type: string
 *               textBody:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [auth, billing, support, marketing, system, notification]
 *               variables:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     required:
 *                       type: boolean
 *             example:
 *               name: Welcome Email
 *               slug: welcome-email
 *               subject: Welcome to {{platformName}}!
 *               htmlBody: <h1>Welcome {{userName}}!</h1>
 *               category: auth
 *               variables:
 *                 - name: userName
 *                   description: User's name
 *                   required: true
 *     responses:
 *       201:
 *         description: Template created
 */
router.post('/', authenticateToken, requirePlatformAdmin, emailTemplateController.createTemplate);

/**
 * @swagger
 * /api/admin/email-templates/{slug}:
 *   patch:
 *     tags: [Email Templates]
 *     summary: Update email template
 *     description: Update template (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               subject:
 *                 type: string
 *               htmlBody:
 *                 type: string
 *               textBody:
 *                 type: string
 *               active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Template updated
 */
router.patch('/:slug', authenticateToken, requirePlatformAdmin, emailTemplateController.updateTemplate);

/**
 * @swagger
 * /api/admin/email-templates/{slug}:
 *   delete:
 *     tags: [Email Templates]
 *     summary: Delete email template
 *     description: Delete template (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Template deleted
 */
router.delete('/:slug', authenticateToken, requirePlatformAdmin, emailTemplateController.deleteTemplate);

/**
 * @swagger
 * /api/admin/email-templates/{slug}/preview:
 *   post:
 *     tags: [Email Templates]
 *     summary: Preview template with variables
 *     description: Render template without sending (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               variables:
 *                 type: object
 *             example:
 *               variables:
 *                 userName: John Doe
 *                 userEmail: john@example.com
 *     responses:
 *       200:
 *         description: Template rendered
 */
router.post('/:slug/preview', authenticateToken, requirePlatformAdmin, emailTemplateController.previewTemplate);

/**
 * @swagger
 * /api/admin/email-templates/{slug}/test:
 *   post:
 *     tags: [Email Templates]
 *     summary: Send test email
 *     description: Send test email with template (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *             properties:
 *               to:
 *                 type: string
 *                 format: email
 *               variables:
 *                 type: object
 *             example:
 *               to: test@example.com
 *               variables:
 *                 userName: Test User
 *     responses:
 *       200:
 *         description: Test email sent
 */
router.post('/:slug/test', authenticateToken, requirePlatformAdmin, emailTemplateController.sendTestEmail);

/**
 * @swagger
 * /api/admin/email-templates/stats/summary:
 *   get:
 *     tags: [Email Templates]
 *     summary: Get template statistics
 *     description: View template usage stats (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved
 */
router.get('/stats/summary', authenticateToken, requirePlatformAdmin, emailTemplateController.getStatistics);

/**
 * @swagger
 * /api/admin/email-templates/initialize/defaults:
 *   post:
 *     tags: [Email Templates]
 *     summary: Initialize default templates
 *     description: Create default email templates (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Default templates created
 */
router.post('/initialize/defaults', authenticateToken, requirePlatformAdmin, emailTemplateController.initializeDefaults);

module.exports = router;
