const express = require('express');
const router = express.Router();
const webhookController = require('./webhook.controller');

// Middleware
const auth = require('../../middleware/auth');
const checkOrgAccess = require('../../middleware/organization/checkOrgAccess');
const checkPlanFeature = require('../../middleware/subscriptions/checkPlanFeature');

/**
 * @swagger
 * tags:
 *   name: Webhooks
 *   description: Outgoing event-driven webhook subscription management
 */

/**
 * @swagger
 * /api/webhooks/subscriptions:
 *   post:
 *     summary: Register a new webhook subscription
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *               - events
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 example: https://my-app.com/webhooks/receiver
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [device.online, device.offline, threshold.breached]
 *                 example: ["device.offline", "threshold.breached"]
 *     responses:
 *       201:
 *         description: Webhook subscription registered successfully
 *       400:
 *         description: Invalid input or maximum subscriptions reached
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - requires org-admin role
 */
router.post(
    '/subscriptions',
    auth,
    checkOrgAccess('org.manage'),
    checkPlanFeature('webhooks'),
    webhookController.createSubscription
);

/**
 * @swagger
 * /api/webhooks/subscriptions:
 *   get:
 *     summary: Get all webhook subscriptions for the organization
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of subscriptions retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get(
    '/subscriptions',
    auth,
    checkOrgAccess('org.manage'),
    checkPlanFeature('webhooks'),
    webhookController.getSubscriptions
);

/**
 * @swagger
 * /api/webhooks/subscriptions/{subscriptionId}:
 *   put:
 *     summary: Update an existing webhook subscription
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
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
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [device.online, device.offline, threshold.breached]
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *     responses:
 *       200:
 *         description: Webhook subscription updated successfully
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Subscription not found
 */
router.put(
    '/subscriptions/:subscriptionId',
    auth,
    checkOrgAccess('org.manage'),
    checkPlanFeature('webhooks'),
    webhookController.updateSubscription
);

/**
 * @swagger
 * /api/webhooks/subscriptions/{subscriptionId}:
 *   delete:
 *     summary: Delete a webhook subscription
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: subscriptionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Webhook subscription deleted successfully
 *       404:
 *         description: Subscription not found
 */
router.delete(
    '/subscriptions/:subscriptionId',
    auth,
    checkOrgAccess('org.manage'),
    checkPlanFeature('webhooks'),
    webhookController.deleteSubscription
);

module.exports = router;
