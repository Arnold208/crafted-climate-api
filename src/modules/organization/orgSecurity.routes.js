'use strict';

/**
 * Org Security Routes
 * Self-service management of allowedOrigins and allowedIPs for API key enforcement.
 *
 * All routes require:
 *  - authenticateToken  (JWT login — only org members manage this)
 *  - checkOrgAccess('org.manage')  (org-admin level only, not regular members)
 *
 * Mounted in organization.routes.js as:
 *   router.use('/', orgSecurityRoutes);
 *
 * Full paths:
 *   GET    /api/org/:orgId/security
 *   POST   /api/org/:orgId/security/origins
 *   DELETE /api/org/:orgId/security/origins
 *   POST   /api/org/:orgId/security/ips
 *   DELETE /api/org/:orgId/security/ips
 */

const router = require('express').Router();
const authenticateToken = require('../../middleware/bearermiddleware');
const checkOrgAccess    = require('../../middleware/organization/checkOrgAccess');
const ctrl              = require('./orgSecurity.controller');

/**
 * @swagger
 * /api/org/{orgId}/security:
 *   get:
 *     tags: [Organization Security]
 *     summary: Get org API security settings (allowed origins and IPs)
 *     description: Returns the list of allowed origins and IP addresses for this org's API keys. When set, API key requests from unlisted origins or IPs are automatically rejected.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Current security settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 allowedOrigins:
 *                   type: array
 *                   items: { type: string }
 *                   example: ["https://app.yourcompany.com"]
 *                 allowedIPs:
 *                   type: array
 *                   items: { type: string }
 *                   example: ["102.45.67.89"]
 *       403:
 *         description: Not a member of this organization or insufficient role
 */
router.get(
    '/:orgId/security',
    authenticateToken,
    checkOrgAccess('org.manage'),
    ctrl.getSecuritySettings
);

/**
 * @swagger
 * /api/org/{orgId}/security/origins:
 *   post:
 *     tags: [Organization Security]
 *     summary: Add an allowed origin for this org's API keys
 *     description: Adds an origin to the allowlist. Once at least one origin is set, API key requests without a matching `Origin` header will be rejected with 403. Takes effect immediately (Redis cache is updated).
 *     security: [{ bearerAuth: [] }]
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
 *             required: [origin]
 *             properties:
 *               origin:
 *                 type: string
 *                 example: "https://app.yourcompany.com"
 *     responses:
 *       200:
 *         description: Origin added successfully
 *       400:
 *         description: Invalid origin format
 *       403:
 *         description: Insufficient permissions
 */
router.post(
    '/:orgId/security/origins',
    authenticateToken,
    checkOrgAccess('org.manage'),
    ctrl.addOrigin
);

/**
 * @swagger
 * /api/org/{orgId}/security/origins:
 *   delete:
 *     tags: [Organization Security]
 *     summary: Remove an allowed origin from this org's API key allowlist
 *     description: Removes an origin from the allowlist. If the list becomes empty, origin restriction is disabled and all origins are accepted. Takes effect immediately.
 *     security: [{ bearerAuth: [] }]
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
 *             required: [origin]
 *             properties:
 *               origin:
 *                 type: string
 *                 example: "https://app.yourcompany.com"
 *     responses:
 *       200:
 *         description: Origin removed successfully
 *       404:
 *         description: Origin not in allowlist
 */
router.delete(
    '/:orgId/security/origins',
    authenticateToken,
    checkOrgAccess('org.manage'),
    ctrl.removeOrigin
);

/**
 * @swagger
 * /api/org/{orgId}/security/ips:
 *   post:
 *     tags: [Organization Security]
 *     summary: Add an allowed IP address for this org's API keys
 *     description: Adds a client IP to the allowlist. Once set, API key requests from unlisted IPs are rejected with 403. Supports IPv4 and IPv6. Takes effect immediately via Redis.
 *     security: [{ bearerAuth: [] }]
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
 *             required: [ip]
 *             properties:
 *               ip:
 *                 type: string
 *                 example: "102.45.67.89"
 *     responses:
 *       200:
 *         description: IP added successfully
 *       400:
 *         description: Invalid IP format
 *       403:
 *         description: Insufficient permissions
 */
router.post(
    '/:orgId/security/ips',
    authenticateToken,
    checkOrgAccess('org.manage'),
    ctrl.addIP
);

/**
 * @swagger
 * /api/org/{orgId}/security/ips:
 *   delete:
 *     tags: [Organization Security]
 *     summary: Remove an allowed IP from this org's API key allowlist
 *     description: Removes an IP from the allowlist. If the list becomes empty, IP restriction is disabled. Takes effect immediately via Redis cache update.
 *     security: [{ bearerAuth: [] }]
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
 *             required: [ip]
 *             properties:
 *               ip:
 *                 type: string
 *                 example: "102.45.67.89"
 *     responses:
 *       200:
 *         description: IP removed successfully
 *       404:
 *         description: IP not in allowlist
 */
router.delete(
    '/:orgId/security/ips',
    authenticateToken,
    checkOrgAccess('org.manage'),
    ctrl.removeIP
);

module.exports = router;
