const express = require('express');
const router = express.Router();
const emailTemplateController = require('./emailTemplate.controller');
const authenticateToken = require('../../middleware/bearermiddleware');
const authorizeRoles = require('../../middleware/rbacMiddleware');

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
router.get('/', authenticateToken, authorizeRoles('admin', 'supervisor'), emailTemplateController.listTemplates);

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
router.get('/:slug', authenticateToken, authorizeRoles('admin', 'supervisor'), emailTemplateController.getTemplate);

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
 *                 example: "Afrilogic Environmental Solutions"
 *               slug:
 *                 type: string
 *                 example: "billing-alert-template"
 *               subject:
 *                 type: string
 *                 example: "Sensor connectivity alert"
 *               htmlBody:
 *                 type: string
 *                 example: "htmlBody_example"
 *               textBody:
 *                 type: string
 *                 example: "textBody_example"
 *               category:
 *                 type: string
 *                 example: "hardware"
 *                 enum: [auth, billing, support, marketing, system, notification]
 *               variables:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: "Afrilogic Environmental Solutions"
 *                     description:
 *                       type: string
 *                       example: "Battery level has dropped below 15% threshold."
 *                     required:
 *                       type: boolean
 *                       example: true
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
router.post('/', authenticateToken, authorizeRoles('admin'), emailTemplateController.createTemplate);

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
 *                 example: "Afrilogic Environmental Solutions"
 *               subject:
 *                 type: string
 *                 example: "Sensor connectivity alert"
 *               htmlBody:
 *                 type: string
 *                 example: "htmlBody_example"
 *               textBody:
 *                 type: string
 *                 example: "textBody_example"
 *               active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Template updated
 */
router.patch('/:slug', authenticateToken, authorizeRoles('admin'), emailTemplateController.updateTemplate);

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
router.delete('/:slug', authenticateToken, authorizeRoles('admin'), emailTemplateController.deleteTemplate);

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
router.post('/:slug/preview', authenticateToken, authorizeRoles('admin', 'supervisor'), emailTemplateController.previewTemplate);

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
 *                 example: "to_example"
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
router.post('/:slug/test', authenticateToken, authorizeRoles('admin'), emailTemplateController.sendTestEmail);

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
router.get('/stats/summary', authenticateToken, authorizeRoles('admin', 'supervisor'), emailTemplateController.getStatistics);

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
router.post('/initialize/defaults', authenticateToken, authorizeRoles('admin'), emailTemplateController.initializeDefaults);

/**
 * @swagger
 * /api/admin/email-templates/test-platform-email:
 *   post:
 *     tags: [Email Templates]
 *     summary: Send platform test email
 *     description: Send a test email of any unified platform email type with default/mock values. (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - type
 *             properties:
 *               to:
 *                 type: string
 *                 format: email
 *                 example: "sylviankimkpe@yahoo.com"
 *               type:
 *                 type: string
 *                 enum:
 *                   - auth.otp
 *                   - auth.welcomeGoogle
 *                   - auth.welcomeDb
 *                   - auth.backofficeMfa
 *                   - admin.passwordResetRequest
 *                   - admin.passwordResetApproved
 *                   - admin.forceUserPasswordReset
 *                   - alert.deviceOfflineWarning
 *                   - alert.deviceOfflineCritical
 *                   - alert.deviceOfflineSevere
 *                   - notification.generic
 *                   - notification.digest
 *                   - org.verificationSubmitted
 *                   - org.verificationApproved
 *                   - org.verificationRejected
 *                   - org.partnerSubmitted
 *                   - org.partnerApproved
 *                   - org.partnerRejected
 *                   - org.partnerRevoked
 *                   - org.typeChangeSubmitted
 *                   - org.typeChangeApproved
 *                   - org.typeChangeRejected
 *                   - org.creationApproved
 *                   - org.creationRejected
 *                   - org.invitation
 *                   - collaboration.deviceAdded
 *                   - subscription.expiry3
 *                   - subscription.expiry2
 *                   - subscription.expiry1
 *                   - subscription.graceStarted
 *                   - subscription.grace2
 *                   - subscription.grace1
 *                   - subscription.downgraded
 *                   - mrv.dataGap
 *                   - mrv.completeness
 *                   - mrv.quarantine
 *                   - mrv.verificationDeadline
 *               vars:
 *                 type: object
 *                 description: Optional override variables. If not provided, rich default mock values are used.
 *     responses:
 *       200:
 *         description: Test email sent successfully
 *       400:
 *         description: Invalid input or failure sending email
 */
router.post('/test-platform-email', authenticateToken, authorizeRoles('admin'), emailTemplateController.sendPlatformTestEmail);

module.exports = router;
