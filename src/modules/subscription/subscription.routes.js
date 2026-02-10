const express = require('express');
const router = express.Router();
const subscriptionController = require('./subscription.controller');

const authenticateToken = require('../../middleware/bearermiddleware');
const authorizeRoles = require('../../middleware/rbacMiddleware');
const checkOrgAccess = require('../../middleware/organization/checkOrgAccess');

/**
 * @swagger
 * tags:
 *   name: Subscriptions
 *   description: Subscription Plan and User Management
 */

// --- Admin Routes ---

// --- Admin Routes ---
/**
 * @swagger
 * /api/subscriptions/admin/create-plan:
 *   post:
 *     tags: [Subscription Plans]
 *     summary: Create a new subscription plan
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, priceMonthly, maxDevices, maxDataRetentionDays]
 *             properties:
 *               name: { type: string }
 *               priceMonthly: { type: number }
 *               priceYearly: { type: number }
 *               maxDevices: { type: number }
 *               maxDataRetentionDays: { type: number }
 *               features: { type: object }
 *     responses:
 *       201: { description: Plan created }
 */
router.post('/admin/create-plan',
    authenticateToken,
    authorizeRoles('admin'),
    subscriptionController.createPlan
);

/**
 * @swagger
 * /api/subscriptions/admin/update-plan/{planId}:
 *   put:
 *     tags: [Subscription Plans]
 *     summary: Update an existing subscription plan
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: planId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200: { description: Plan updated }
 */
router.put('/admin/update-plan/:planId',
    authenticateToken,
    authorizeRoles('admin'),
    subscriptionController.updatePlan
);

/**
 * @swagger
 * /api/subscriptions/admin/delete-plan/{planId}:
 *   delete:
 *     tags: [Subscription Plans]
 *     summary: Delete a subscription plan
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: planId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Plan deleted }
 */
router.delete('/admin/delete-plan/:planId',
    authenticateToken,
    authorizeRoles('admin'),
    subscriptionController.deletePlan
);

/**
 * @swagger
 * /api/subscriptions/admin/plans:
 *   get:
 *     tags: [Subscription Plans]
 *     summary: List all subscription plans
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: List of plans }
 */
router.get('/admin/plans',
    authenticateToken,
    authorizeRoles('admin'),
    subscriptionController.getAllPlans
);

/**
 * @swagger
 * /api/subscriptions/admin/toggle-plan/{planId}:
 *   patch:
 *     tags: [Subscription Plans]
 *     summary: Toggle plan active status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: planId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Plan status toggled }
 */
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
 *     responses:
 *       200: { description: Subscription initialized }
 *       400: { description: Subscription already exists }
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
 *     responses:
 *       200: { description: Active subscription details }
 *       404: { description: No active subscription found }
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
 *     responses:
 *       200: { description: Subscription upgraded successfully }
 *       400: { description: Invalid plan or downgrade attempted }
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
 *     responses:
 *       200: { description: Subscription downgraded (scheduled for next billing cycle) }
 *       400: { description: Invalid plan }
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
 *     responses:
 *       200: { description: Billing cycle updated }
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
 *     responses:
 *       200: { description: Subscription cancelled }
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
 *     responses:
 *       200: { description: Subscription reactivated }
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

// --- Organization Subscription Management ---

/**
 * @swagger
 * /api/subscriptions/org/{orgId}/current:
 *   get:
 *     summary: Get organization subscription
 *     tags: [Organization Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Subscription details }
 *       404: { description: No active subscription }
 */
router.get('/org/:orgId/current',
    authenticateToken,
    checkOrgAccess('org.billing.view'),
    subscriptionController.getOrgSubscription
);

/**
 * @swagger
 * /api/subscriptions/org/{orgId}/upgrade:
 *   post:
 *     summary: Upgrade organization subscription
 *     tags: [Organization Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetPlanId]
 *             properties:
 *               targetPlanId: { type: string }
 *     responses:
 *       200: { description: Upgraded }
 */
router.post('/org/:orgId/upgrade',
    authenticateToken,
    checkOrgAccess('org.billing.update'),
    subscriptionController.upgradeOrgSubscription
);

/**
 * @swagger
 * /api/subscriptions/org/{orgId}/downgrade:
 *   post:
 *     summary: Downgrade organization subscription
 *     tags: [Organization Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetPlanId]
 *             properties:
 *               targetPlanId: { type: string }
 *     responses:
 *       200: { description: Downgraded }
 */
router.post('/org/:orgId/downgrade',
    authenticateToken,
    checkOrgAccess('org.billing.update'),
    subscriptionController.downgradeOrgSubscription
);

/**
 * @swagger
 * /api/subscriptions/org/{orgId}/billing-cycle:
 *   patch:
 *     summary: Update organization billing cycle
 *     tags: [Organization Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [billingCycle]
 *             properties:
 *               billingCycle: { type: string, enum: [monthly, yearly] }
 *     responses:
 *       200: { description: Cycle updated }
 */
router.patch('/org/:orgId/billing-cycle',
    authenticateToken,
    checkOrgAccess('org.billing.update'),
    subscriptionController.updateOrgBillingCycle
);

/**
 * @swagger
 * /api/subscriptions/org/{orgId}/cancel:
 *   post:
 *     summary: Cancel organization subscription
 *     tags: [Organization Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Cancelled }
 */
router.post('/org/:orgId/cancel',
    authenticateToken,
    checkOrgAccess('org.billing.update'),
    subscriptionController.cancelOrgSubscription
);

/**
 * @swagger
 * /api/subscriptions/org/{orgId}/reactivate:
 *   post:
 *     summary: Reactivate organization subscription
 *     tags: [Organization Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Reactivated }
 */
router.post('/org/:orgId/reactivate',
    authenticateToken,
    checkOrgAccess('org.billing.update'),
    subscriptionController.reactivateOrgSubscription
);

/**
 * @swagger
 * /api/subscriptions/debug-fix-plan/{orgId}:
 *   get:
 *     summary: Debug - Force Update Organization Plan Type
 *     tags: [Organization Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Plan type updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 orgId: { type: string }
 *                 planId: { type: string }
 *                 planName: { type: string }
 *                 oldPlanType: { type: string }
 *                 newPlanType: { type: string }
 *       404: { description: Org or Plan not found }
 */
router.get('/debug-fix-plan/:orgId',
    authenticateToken,
    subscriptionController.debugFixPlanType
);

/**
 * @swagger
 * /api/subscriptions/verify-plan/{orgId}:
 *   get:
 *     summary: Debug - Verify Organization Plan and Collaboration Status
 *     tags: [Organization Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Plan verification details
 *       404: { description: Organization not found }
 */
router.get('/verify-plan/:orgId',
    authenticateToken,
    subscriptionController.verifyOrgPlan
);

module.exports = router;
