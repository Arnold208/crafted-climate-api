const express = require('express');
const router = express.Router();
const analyticsController = require('./analytics.controller');
const checkOrgAccess = require('../../middleware/organization/checkOrgAccess');
const checkPlanFeature = require('../../middleware/subscriptions/checkPlanFeature');

/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: AI Insights and System Stats
 */

/**
 * @swagger
 * /api/analytics/org/{orgId}/insights:
 *   get:
 *     tags: [Analytics]
 *     summary: Get AI-driven insights (Pro/Enterprise only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: AI Insights object
 *       403:
 *         description: Feature not available on current plan
 */
router.get(
    '/org/:orgId/insights',
    checkOrgAccess('read_analytics'),      // 1. RBAC Check (Must be Org Member)
    checkPlanFeature('analytics'),         // 2. Plan Switch (Must have Analytics feature)
    analyticsController.getOrgInsights    // 3. Controller
);

module.exports = router;
