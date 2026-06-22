const express = require('express');
const router = express.Router();
const logsController = require('./logs.controller');
const rateLimit = require('express-rate-limit');

const authenticateToken = require('../../middleware/bearermiddleware');
const checkOrgAccess = require('../../middleware/organization/checkOrgAccess');
const { requirePermission } = require('../../middleware/authenticateApiKey');

const logQueryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many log queries, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * @swagger
 * tags:
 *   name: Audit Logs
 *   description: Access audit logs for organizations and platform
 */

/**
 * @swagger
 * /api/logs/org/{orgId}/logs:
 *   get:
 *     tags: [Audit Logs]
 *     summary: Get organization audit logs
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string, example: "org-starter-uuid" }
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 10, default: 50 }
 *       - in: query
 *         name: action
 *         schema: { type: string, example: "device:register" }
 *       - in: query
 *         name: actor
 *         schema: { type: string, example: "actor_example" }
 *     responses:
 *       200: { description: Logs retrieved successfully }
 *       403: { description: Forbidden }
 */
router.get('/org/:orgId/logs',
    authenticateToken,
    logQueryLimiter,
    requirePermission('logs:read'),
    checkOrgAccess('org.logs.view'),
    logsController.getOrgLogs
);

/**
 * @swagger
 * /api/logs/platform/logs:
 *   get:
 *     tags: [Audit Logs]
 *     summary: Get platform audit logs (Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 10, default: 50 }
 *     responses:
 *       200: { description: Platform logs retrieved }
 *       403: { description: Admin access required }
 */
router.get('/platform/logs',
    authenticateToken,
    logQueryLimiter,
    requirePermission('logs:read'),
    logsController.getPlatformLogs
);

module.exports = router;
