const express = require('express');
const router = express.Router();
const adminPlanController = require('./adminPlan.controller');
const authenticateToken = require('../../middleware/bearermiddleware');
const requirePlatformAdmin = require('../../middleware/requirePlatformAdmin');

/**
 * @swagger
 * /api/admin/plans:
 *   get:
 *     tags: [Platform Admin - Plans]
 *     summary: List all plans
 *     description: Get list of subscription plans (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Plans retrieved
 *       403:
 *         description: Forbidden
 */
router.get('/', authenticateToken, requirePlatformAdmin, adminPlanController.listPlans);

/**
 * @swagger
 * /api/admin/plans:
 *   post:
 *     tags: [Platform Admin - Plans]
 *     summary: Create new plan
 *     description: Create a new subscription plan (Platform Admin only)
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
 *               - priceMonthly
 *               - maxDevices
 *               - maxDataRetentionDays
 *             properties:
 *               name:
 *                 type: string
 *                 enum: [freemium, starter, premium, enterprise, maas_starter, maas_premium, maas_enterprise]
 *                 description: Unique plan name
 *               description:
 *                 type: string
 *               priceMonthly:
 *                 type: number
 *                 description: Monthly subscription price in Cedis (GHS)
 *               priceYearly:
 *                 type: number
 *                 description: Yearly subscription price in Cedis (GHS)
 *               maxDevices:
 *                 type: number
 *                 description: Maximum devices allowed (use -1 or null for unlimited)
 *               maxDataRetentionDays:
 *                 type: number
 *                 description: Data retention period in days (use -1 or null for unlimited)
 *               features:
 *                 type: object
 *                 properties:
 *                   fullSensorAccess:
 *                     type: boolean
 *                   aiInsightsLevel:
 *                     type: string
 *                     enum: [none, basic, moderate, advanced]
 *                   apiAccess:
 *                     type: string
 *                     enum: [none, limited, full]
 *                   alerts:
 *                     type: string
 *                     enum: [none, basic, smart, automated]
 *                   firmwareUpdates:
 *                     type: boolean
 *                   customerSupportLevel:
 *                     type: string
 *                     enum: [none, 48h, 24/7]
 *                   device_read:
 *                     type: boolean
 *                   device_update:
 *                     type: boolean
 *                   collaboration:
 *                     type: boolean
 *                   location_access:
 *                     type: boolean
 *                   public_listing:
 *                     type: boolean
 *                   export:
 *                     type: boolean
 *                   maxMembers:
 *                     type: number
 *                     description: Max org members allowed (null for unlimited)
 *                   websockets:
 *                     type: boolean
 *                     description: Whether WebSocket access is enabled
 *                   webhooks:
 *                     type: boolean
 *                     description: Whether Webhooks access is enabled
 *                   maxApiCallsPerMonth:
 *                     type: number
 *                     description: Monthly API calls quota limit
 *               enterprise:
 *                 type: object
 *                 properties:
 *                   enableSLAs:
 *                     type: boolean
 *                   dedicatedAccountManager:
 *                     type: boolean
 *                   customDeployments:
 *                     type: boolean
 *     responses:
 *       201:
 *         description: Plan created
 *       400:
 *         description: Invalid input or duplicate name
 */
router.post('/', authenticateToken, requirePlatformAdmin, adminPlanController.createPlan);

/**
 * @swagger
 * /api/admin/plans/{planId}:
 *   get:
 *     tags: [Platform Admin - Plans]
 *     summary: Get plan details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: planId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Plan details
 *       404:
 *         description: Plan not found
 */
router.get('/:planId', authenticateToken, requirePlatformAdmin, adminPlanController.getPlan);

/**
 * @swagger
 * /api/admin/plans/{planId}:
 *   put:
 *     tags: [Platform Admin - Plans]
 *     summary: Update plan
 *     description: Update an existing plan (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: planId
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
 *               name:
 *                 type: string
 *                 enum: [freemium, starter, premium, enterprise, maas_starter, maas_premium, maas_enterprise]
 *                 description: Plan name
 *               description:
 *                 type: string
 *               priceMonthly:
 *                 type: number
 *                 description: Monthly subscription price in Cedis (GHS)
 *               priceYearly:
 *                 type: number
 *                 description: Yearly subscription price in Cedis (GHS)
 *               maxDevices:
 *                 type: number
 *                 description: Maximum devices allowed
 *               maxDataRetentionDays:
 *                 type: number
 *                 description: Data retention period in days
 *               features:
 *                 type: object
 *                 properties:
 *                   fullSensorAccess:
 *                     type: boolean
 *                   aiInsightsLevel:
 *                     type: string
 *                     enum: [none, basic, moderate, advanced]
 *                   apiAccess:
 *                     type: string
 *                     enum: [none, limited, full]
 *                   alerts:
 *                     type: string
 *                     enum: [none, basic, smart, automated]
 *                   firmwareUpdates:
 *                     type: boolean
 *                   customerSupportLevel:
 *                     type: string
 *                     enum: [none, 48h, 24/7]
 *                   device_read:
 *                     type: boolean
 *                   device_update:
 *                     type: boolean
 *                   collaboration:
 *                     type: boolean
 *                   location_access:
 *                     type: boolean
 *                   public_listing:
 *                     type: boolean
 *                   export:
 *                     type: boolean
 *                   maxMembers:
 *                     type: number
 *                   websockets:
 *                     type: boolean
 *                   webhooks:
 *                     type: boolean
 *                   maxApiCallsPerMonth:
 *                     type: number
 *               enterprise:
 *                 type: object
 *                 properties:
 *                   enableSLAs:
 *                     type: boolean
 *                   dedicatedAccountManager:
 *                     type: boolean
 *                   customDeployments:
 *                     type: boolean
 *     responses:
 *       200:
 *         description: Plan updated
 *       404:
 *         description: Plan not found
 */
router.put('/:planId', authenticateToken, requirePlatformAdmin, adminPlanController.updatePlan);

/**
 * @swagger
 * /api/admin/plans/{planId}:
 *   delete:
 *     tags: [Platform Admin - Plans]
 *     summary: Deactivate plan
 *     description: Soft delete a plan (set isActive=false). Existing subscriptions remain valid. (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: planId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Plan deactivated
 *       404:
 *         description: Plan not found
 */
router.delete('/:planId', authenticateToken, requirePlatformAdmin, adminPlanController.deletePlan);

module.exports = router;
