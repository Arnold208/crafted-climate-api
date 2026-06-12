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
 *           example: true
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
 *                 example: "Afrilogic Environmental Solutions"
 *                 enum: [freemium, starter, premium, enterprise, maas_starter, maas_premium, maas_enterprise]
 *                 description: Unique plan name
 *               description:
 *                 type: string
 *                 example: "Battery level has dropped below 15% threshold."
 *               priceMonthly:
 *                 type: number
 *                 example: 1
 *                 description: Monthly subscription price in Cedis (GHS)
 *               priceYearly:
 *                 type: number
 *                 example: 1
 *                 description: Yearly subscription price in Cedis (GHS)
 *               maxDevices:
 *                 type: number
 *                 example: 1
 *                 description: Maximum devices allowed (use -1 or null for unlimited)
 *               maxDataRetentionDays:
 *                 type: number
 *                 example: 1
 *                 description: Data retention period in days (use -1 or null for unlimited)
 *               features:
 *                 type: object
 *                 properties:
 *                   fullSensorAccess:
 *                     type: boolean
 *                     example: true
 *                   aiInsightsLevel:
 *                     type: string
 *                     example: "aiInsightsLevel_example"
 *                     enum: [none, basic, moderate, advanced]
 *                   apiAccess:
 *                     type: string
 *                     example: "apiAccess_example"
 *                     enum: [none, limited, full]
 *                   alerts:
 *                     type: string
 *                     example: "alerts_example"
 *                     enum: [none, basic, smart, automated]
 *                   firmwareUpdates:
 *                     type: boolean
 *                     example: true
 *                   customerSupportLevel:
 *                     type: string
 *                     example: "customerSupportLevel_example"
 *                     enum: [none, 48h, 24/7]
 *                   device_read:
 *                     type: boolean
 *                     example: true
 *                   device_update:
 *                     type: boolean
 *                     example: true
 *                   collaboration:
 *                     type: boolean
 *                     example: true
 *                   location_access:
 *                     type: boolean
 *                     example: true
 *                   public_listing:
 *                     type: boolean
 *                     example: true
 *                   export:
 *                     type: boolean
 *                     example: true
 *                   maxMembers:
 *                     type: number
 *                     example: 1
 *                     description: Max org members allowed (null for unlimited)
 *                   websockets:
 *                     type: boolean
 *                     example: true
 *                     description: Whether WebSocket access is enabled
 *                   webhooks:
 *                     type: boolean
 *                     example: true
 *                     description: Whether Webhooks access is enabled
 *                   maxApiCallsPerMonth:
 *                     type: number
 *                     example: 1
 *                     description: Monthly API calls quota limit
 *               enterprise:
 *                 type: object
 *                 properties:
 *                   enableSLAs:
 *                     type: boolean
 *                     example: true
 *                   dedicatedAccountManager:
 *                     type: boolean
 *                     example: true
 *                   customDeployments:
 *                     type: boolean
 *                     example: true
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
 *           example: "plan-starter-uuid"
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
 *           example: "plan-starter-uuid"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Afrilogic Environmental Solutions"
 *                 enum: [freemium, starter, premium, enterprise, maas_starter, maas_premium, maas_enterprise]
 *                 description: Plan name
 *               description:
 *                 type: string
 *                 example: "Battery level has dropped below 15% threshold."
 *               priceMonthly:
 *                 type: number
 *                 example: 1
 *                 description: Monthly subscription price in Cedis (GHS)
 *               priceYearly:
 *                 type: number
 *                 example: 1
 *                 description: Yearly subscription price in Cedis (GHS)
 *               maxDevices:
 *                 type: number
 *                 example: 1
 *                 description: Maximum devices allowed
 *               maxDataRetentionDays:
 *                 type: number
 *                 example: 1
 *                 description: Data retention period in days
 *               features:
 *                 type: object
 *                 properties:
 *                   fullSensorAccess:
 *                     type: boolean
 *                     example: true
 *                   aiInsightsLevel:
 *                     type: string
 *                     example: "aiInsightsLevel_example"
 *                     enum: [none, basic, moderate, advanced]
 *                   apiAccess:
 *                     type: string
 *                     example: "apiAccess_example"
 *                     enum: [none, limited, full]
 *                   alerts:
 *                     type: string
 *                     example: "alerts_example"
 *                     enum: [none, basic, smart, automated]
 *                   firmwareUpdates:
 *                     type: boolean
 *                     example: true
 *                   customerSupportLevel:
 *                     type: string
 *                     example: "customerSupportLevel_example"
 *                     enum: [none, 48h, 24/7]
 *                   device_read:
 *                     type: boolean
 *                     example: true
 *                   device_update:
 *                     type: boolean
 *                     example: true
 *                   collaboration:
 *                     type: boolean
 *                     example: true
 *                   location_access:
 *                     type: boolean
 *                     example: true
 *                   public_listing:
 *                     type: boolean
 *                     example: true
 *                   export:
 *                     type: boolean
 *                     example: true
 *                   maxMembers:
 *                     type: number
 *                     example: 1
 *                   websockets:
 *                     type: boolean
 *                     example: true
 *                   webhooks:
 *                     type: boolean
 *                     example: true
 *                   maxApiCallsPerMonth:
 *                     type: number
 *                     example: 1
 *               enterprise:
 *                 type: object
 *                 properties:
 *                   enableSLAs:
 *                     type: boolean
 *                     example: true
 *                   dedicatedAccountManager:
 *                     type: boolean
 *                     example: true
 *                   customDeployments:
 *                     type: boolean
 *                     example: true
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
 *           example: "plan-starter-uuid"
 *     responses:
 *       200:
 *         description: Plan deactivated
 *       404:
 *         description: Plan not found
 */
router.delete('/:planId', authenticateToken, requirePlatformAdmin, adminPlanController.deletePlan);

module.exports = router;
