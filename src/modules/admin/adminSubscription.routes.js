const express = require('express');
const router = express.Router();
const adminSubscriptionController = require('./adminSubscription.controller');
const authenticateToken = require('../../middleware/bearermiddleware');
const requirePlatformAdmin = require('../../middleware/requirePlatformAdmin');

/**
 * @swagger
 * /api/admin/subscriptions:
 *   get:
 *     tags: [Platform Admin - Subscription Management]
 *     summary: List all subscriptions
 *     description: Get paginated list of subscriptions with filters (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, expired, cancelled, grace_period]
 *       - in: query
 *         name: planId
 *         schema:
 *           type: string
 *       - in: query
 *         name: billingCycle
 *         schema:
 *           type: string
 *           enum: [free, monthly, yearly]
 *       - in: query
 *         name: userid
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Subscriptions retrieved
 *       403:
 *         description: Forbidden
 */
router.get('/', authenticateToken, requirePlatformAdmin, adminSubscriptionController.listSubscriptions);

/**
 * @swagger
 * /api/admin/subscriptions/{subscriptionId}:
 *   get:
 *     tags: [Platform Admin - Subscription Management]
 *     summary: Get subscription details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subscriptionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Subscription details
 *       404:
 *         description: Not found
 */
router.get('/:subscriptionId', authenticateToken, requirePlatformAdmin, adminSubscriptionController.getSubscriptionDetails);

/**
 * @swagger
 * /api/admin/subscriptions/{subscriptionId}/plan:
 *   patch:
 *     tags: [Platform Admin - Subscription Management]
 *     summary: Change subscription plan
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subscriptionId
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
 *               - planId
 *             properties:
 *               planId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Plan changed
 */
router.patch('/:subscriptionId/plan', authenticateToken, requirePlatformAdmin, adminSubscriptionController.changePlan);

/**
 * @swagger
 * /api/admin/subscriptions/{subscriptionId}/extend:
 *   post:
 *     tags: [Platform Admin - Subscription Management]
 *     summary: Extend subscription expiry
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subscriptionId
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
 *               - endDate
 *             properties:
 *               endDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Subscription extended
 */
router.post('/:subscriptionId/extend', authenticateToken, requirePlatformAdmin, adminSubscriptionController.extendExpiry);

/**
 * @swagger
 * /api/admin/subscriptions/{subscriptionId}:
 *   delete:
 *     tags: [Platform Admin - Subscription Management]
 *     summary: Cancel subscription
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subscriptionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Subscription cancelled
 */
router.delete('/:subscriptionId', authenticateToken, requirePlatformAdmin, adminSubscriptionController.cancelSubscription);

/**
 * @swagger
 * /api/admin/subscriptions/expiring:
 *   get:
 *     tags: [Platform Admin - Subscription Management]
 *     summary: Get expiring subscriptions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *     responses:
 *       200:
 *         description: Expiring subscriptions
 */
router.get('/expiring/list', authenticateToken, requirePlatformAdmin, adminSubscriptionController.getExpiringSubscriptions);

/**
 * @swagger
 * /api/admin/subscriptions/revenue/analytics:
 *   get:
 *     tags: [Platform Admin - Subscription Management]
 *     summary: Get revenue analytics
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
 *         description: Revenue metrics
 */
router.get('/revenue/analytics', authenticateToken, requirePlatformAdmin, adminSubscriptionController.getRevenueAnalytics);

module.exports = router;
