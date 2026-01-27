const express = require('express');
const router = express.Router();
const systemConfigController = require('./systemConfig.controller');
const authenticateToken = require('../../middleware/bearermiddleware');
const requirePlatformAdmin = require('../../middleware/requirePlatformAdmin');

/**
 * @swagger
 * /api/admin/config:
 *   get:
 *     tags: [System Config]
 *     summary: Get system configuration
 *     description: Get platform-wide configuration (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuration retrieved
 *       403:
 *         description: Forbidden
 */
router.get('/', authenticateToken, requirePlatformAdmin, systemConfigController.getConfig);

/**
 * @swagger
 * /api/admin/config/features:
 *   patch:
 *     tags: [System Config]
 *     summary: Update feature flags
 *     description: Enable/disable platform features (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               features:
 *                 type: object
 *                 properties:
 *                   userRegistration:
 *                     type: boolean
 *                   googleOAuth:
 *                     type: boolean
 *                   deviceRegistration:
 *                     type: boolean
 *             example:
 *               features:
 *                 userRegistration: true
 *                 googleOAuth: true
 *     responses:
 *       200:
 *         description: Features updated
 */
router.patch('/features', authenticateToken, requirePlatformAdmin, systemConfigController.updateFeatures);

/**
 * @swagger
 * /api/admin/config/rate-limits:
 *   patch:
 *     tags: [System Config]
 *     summary: Update rate limits
 *     description: Update API rate limits (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rateLimits:
 *                 type: object
 *                 properties:
 *                   global:
 *                     type: object
 *                     properties:
 *                       windowMs:
 *                         type: integer
 *                       max:
 *                         type: integer
 *             example:
 *               rateLimits:
 *                 global:
 *                   windowMs: 900000
 *                   max: 100
 *     responses:
 *       200:
 *         description: Rate limits updated
 */
router.patch('/rate-limits', authenticateToken, requirePlatformAdmin, systemConfigController.updateRateLimits);

/**
 * @swagger
 * /api/admin/config/maintenance:
 *   patch:
 *     tags: [System Config]
 *     summary: Toggle maintenance mode
 *     description: Enable/disable maintenance mode (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enabled
 *             properties:
 *               enabled:
 *                 type: boolean
 *               message:
 *                 type: string
 *             example:
 *               enabled: true
 *               message: Scheduled maintenance - back soon
 *     responses:
 *       200:
 *         description: Maintenance mode updated
 */
router.patch('/maintenance', authenticateToken, requirePlatformAdmin, systemConfigController.toggleMaintenance);

/**
 * @swagger
 * /api/admin/config/history:
 *   get:
 *     tags: [System Config]
 *     summary: Get configuration change history
 *     description: View configuration change history (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Change history retrieved
 */
router.get('/history', authenticateToken, requirePlatformAdmin, systemConfigController.getChangeHistory);

module.exports = router;
