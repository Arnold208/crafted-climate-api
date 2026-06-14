const express = require('express');
const router = express.Router();
const adminAnalyticsController = require('./adminAnalytics.controller');
const authenticateToken = require('../../middleware/bearermiddleware');
const authorizeRoles = require('../../middleware/rbacMiddleware');

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
 *                   example: 1
 *                 newUsers:
 *                   type: integer
 *                   example: 1
 *                 verifiedUsers:
 *                   type: integer
 *                   example: 1
 *                 signupTrend:
 *                   type: array
 *                   example: ["example_value"]
 */
router.get('/users', authenticateToken, authorizeRoles('admin', 'supervisor', 'support'), adminAnalyticsController.getUserGrowth);

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
router.get('/devices', authenticateToken, authorizeRoles('admin', 'supervisor', 'support'), adminAnalyticsController.getDeviceUsage);

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
 *                   example: 1
 *                 personal:
 *                   type: integer
 *                   example: 1
 *                 business:
 *                   type: integer
 *                   example: 1
 *                 verified:
 *                   type: integer
 *                   example: 1
 *                 partners:
 *                   type: integer
 *                   example: 1
 */
router.get('/organizations', authenticateToken, authorizeRoles('admin', 'supervisor', 'support'), adminAnalyticsController.getOrganizationMetrics);

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
router.get('/api-usage', authenticateToken, authorizeRoles('admin', 'supervisor', 'support'), adminAnalyticsController.getAPIUsage);

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
router.get('/overview', authenticateToken, authorizeRoles('admin', 'supervisor', 'support'), adminAnalyticsController.getPlatformOverview);

module.exports = router;
