const express = require('express');
const router = express.Router();
const adminAnalyticsController = require('./adminAnalytics.controller');
const authenticateToken = require('../../middleware/bearermiddleware');
const requirePlatformAdmin = require('../../middleware/requirePlatformAdmin');

/**
 * @swagger
 * /api/admin/analytics/users:
 *   get:
 *     tags: [Analytics]
 *     summary: Get user growth metrics
 *     description: Get user statistics and signup trends (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: User metrics retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalUsers:
 *                   type: integer
 *                 newUsers:
 *                   type: integer
 *                 verifiedUsers:
 *                   type: integer
 *                 signupTrend:
 *                   type: array
 */
router.get('/users', authenticateToken, requirePlatformAdmin, adminAnalyticsController.getUserGrowth);

/**
 * @swagger
 * /api/admin/analytics/devices:
 *   get:
 *     tags: [Analytics]
 *     summary: Get device usage metrics
 *     description: Get device statistics and usage patterns (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Device metrics retrieved
 */
router.get('/devices', authenticateToken, requirePlatformAdmin, adminAnalyticsController.getDeviceUsage);

/**
 * @swagger
 * /api/admin/analytics/organizations:
 *   get:
 *     tags: [Analytics]
 *     summary: Get organization metrics
 *     description: Get organization statistics (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Organization metrics retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalOrganizations:
 *                   type: integer
 *                 personal:
 *                   type: integer
 *                 business:
 *                   type: integer
 *                 verified:
 *                   type: integer
 *                 partners:
 *                   type: integer
 */
router.get('/organizations', authenticateToken, requirePlatformAdmin, adminAnalyticsController.getOrganizationMetrics);

/**
 * @swagger
 * /api/admin/analytics/api-usage:
 *   get:
 *     tags: [Analytics]
 *     summary: Get API usage statistics
 *     description: Get API request statistics (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: API usage stats retrieved
 */
router.get('/api-usage', authenticateToken, requirePlatformAdmin, adminAnalyticsController.getAPIUsage);

/**
 * @swagger
 * /api/admin/analytics/overview:
 *   get:
 *     tags: [Analytics]
 *     summary: Get platform overview
 *     description: Get complete platform dashboard metrics (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Platform overview retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: object
 *                 devices:
 *                   type: object
 *                 organizations:
 *                   type: object
 *                 subscriptions:
 *                   type: object
 */
router.get('/overview', authenticateToken, requirePlatformAdmin, adminAnalyticsController.getPlatformOverview);

module.exports = router;
