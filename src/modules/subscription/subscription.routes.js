const express = require('express');
const router = express.Router();
const subscriptionController = require('./subscription.controller');

const authenticateToken = require('../../middleware/bearermiddleware');
const authorizeRoles = require('../../middleware/rbacMiddleware');

/**
 * @swagger
 * tags:
 *   name: Subscriptions
 *   description: Subscription Plan and User Management
 */

// --- Admin Routes ---

router.post('/admin/create-plan',
    authenticateToken,
    authorizeRoles('admin'),
    subscriptionController.createPlan
);

router.put('/admin/update-plan/:planId',
    authenticateToken,
    authorizeRoles('admin'),
    subscriptionController.updatePlan
);

router.delete('/admin/delete-plan/:planId',
    authenticateToken,
    authorizeRoles('admin'),
    subscriptionController.deletePlan
);

router.get('/admin/plans',
    authenticateToken,
    authorizeRoles('admin'),
    subscriptionController.getAllPlans
);

router.patch('/admin/toggle-plan/:planId',
    authenticateToken,
    authorizeRoles('admin'),
    subscriptionController.togglePlan
);

// --- User Routes ---

/**
 * @swagger
 * /api/subscriptions/user/init:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Initialize a default FREEMIUM subscription
 *     security:
 *       - bearerAuth: []
 */
router.post('/user/init',
    authenticateToken,
    subscriptionController.initSubscription
);

/**
 * @swagger
 * /api/subscriptions/user/my-subscription:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Get current user's active subscription
 *     security:
 *       - bearerAuth: []
 */
router.get('/user/my-subscription',
    authenticateToken,
    subscriptionController.getUserSubscription
);

/**
 * @swagger
 * /api/subscriptions/user/upgrade:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Upgrade subscription to a higher plan
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetPlanId]
 *             properties:
 *               targetPlanId: { type: string }
 */
router.post('/user/upgrade',
    authenticateToken,
    subscriptionController.upgradeSubscription
);

/**
 * @swagger
 * /api/subscriptions/user/downgrade:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Downgrade subscription to a lower plan
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetPlanId]
 *             properties:
 *               targetPlanId: { type: string }
 */
router.post('/user/downgrade',
    authenticateToken,
    subscriptionController.downgradeSubscription
);

/**
 * @swagger
 * /api/subscriptions/user/billing-cycle:
 *   patch:
 *     tags: [Subscriptions]
 *     summary: Update billing cycle (monthly/yearly)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [billingCycle]
 *             properties:
 *               billingCycle: { type: string, enum: [monthly, yearly] }
 */
router.patch('/user/billing-cycle',
    authenticateToken,
    subscriptionController.updateBillingCycle
);

/**
 * @swagger
 * /api/subscriptions/user/cancel:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Cancel current subscription
 *     security:
 *       - bearerAuth: []
 */
router.post('/user/cancel',
    authenticateToken,
    subscriptionController.cancelSubscription
);

/**
 * @swagger
 * /api/subscriptions/user/reactivate:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Reactivate a cancelled subscription
 *     security:
 *       - bearerAuth: []
 */
router.post('/user/reactivate',
    authenticateToken,
    subscriptionController.reactivateSubscription
);

// --- Pricing Routes ---

/**
 * @swagger
 * /api/subscriptions/pricing/calculate:
 *   get:
 *     summary: Calculate enterprise pricing based on device count
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: planId
 *         required: true
 *         schema:
 *           type: string
 *         description: Plan ID to calculate pricing for
 *         example: "plan-enterprise-uuid"
 *       - in: query
 *         name: deviceCount
 *         required: true
 *         schema:
 *           type: integer
 *         description: Number of devices
 *         example: 75
 *     responses:
 *       200:
 *         description: Pricing calculation successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 planName:
 *                   type: string
 *                   example: "Enterprise"
 *                 deviceCount:
 *                   type: integer
 *                   example: 75
 *                 tier:
 *                   type: string
 *                   example: "Tier 2"
 *                 tierDescription:
 *                   type: string
 *                   example: "Growing business (51-100 devices)"
 *                 monthly:
 *                   type: object
 *                   properties:
 *                     basePrice:
 *                       type: number
 *                       example: 199
 *                     discountPercentage:
 *                       type: number
 *                       example: 5
 *                     discountAmount:
 *                       type: number
 *                       example: 9.95
 *                     finalPrice:
 *                       type: number
 *                       example: 189.05
 *                 yearly:
 *                   type: object
 *                   properties:
 *                     basePrice:
 *                       type: number
 *                       example: 1990
 *                     discountPercentage:
 *                       type: number
 *                       example: 5
 *                     discountAmount:
 *                       type: number
 *                       example: 99.50
 *                     finalPrice:
 *                       type: number
 *                       example: 1890.50
 *                     monthlySavings:
 *                       type: number
 *                       example: 497.50
 *       400:
 *         description: Missing required parameters
 *       404:
 *         description: Plan not found
 */
router.get('/pricing/calculate',
    authenticateToken,
    subscriptionController.calculatePricing
);

/**
 * @swagger
 * /api/subscriptions/pricing/tiers:
 *   get:
 *     summary: Get all enterprise tier definitions
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Enterprise tiers retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tiers:
 *                   type: object
 *                   properties:
 *                     TIER_1:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                           example: "Tier 1"
 *                         minDevices:
 *                           type: integer
 *                           example: 0
 *                         maxDevices:
 *                           type: integer
 *                           example: 50
 *                         discountPercentage:
 *                           type: number
 *                           example: 0
 *                         description:
 *                           type: string
 *                           example: "Small business (0-50 devices)"
 */
router.get('/pricing/tiers',
    authenticateToken,
    subscriptionController.getEnterpriseTiers
);

module.exports = router;
