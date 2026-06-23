const express = require('express');
const router = express.Router({ mergeParams: true });
const orgApiKeyController = require('./orgApiKey.controller');
const authenticateToken = require('../../middleware/bearermiddleware');

/**
 * @swagger
 * /api/org/{orgId}/api-keys:
 *   post:
 *     tags: [Organization - API Keys]
 *     summary: Generate new API key
 *     description: |
 *       Create a new API key for the organization. Requires JWT Bearer auth.
 *       - **Freemium plans**: Key generation is blocked.
 *       - **Starter**: Max 3 active keys.
 *       - **Premium**: Max 10 active keys.
 *       - **Enterprise**: Unlimited keys.
 *
 *       The full key (`cc_live_...`) is returned **only once** on creation — store it securely.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
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
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Afrilogic Environmental Solutions"
 *                 maxLength: 100
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [telemetry:read, telemetry:write, devices:read, devices:write, analytics:read]
 *               rateLimit:
 *                 type: object
 *                 properties:
 *                   requests:
 *                     type: integer
 *                     example: 1000
 *                   windowMs:
 *                     type: integer
 *                     example: 3600000
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *               rotationSchedule:
 *                 type: string
 *                 enum: [none, monthly, quarterly, yearly]
 *               allowedIPs:
 *                 type: array
 *                 items:
 *                   type: string
 *             example:
 *               name: Production API Key
 *               permissions: [telemetry:write, devices:read]
 *               rateLimit:
 *                 requests: 1000
 *                 windowMs: 3600000
 *               rotationSchedule: quarterly
 *     responses:
 *       201:
 *         description: API key generated successfully — save the `key` field, it is shown only once
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     key:
 *                       type: string
 *                       example: "cc_live_a1b2c3d4_abcdef..."
 *                       description: Full API key (shown only once)
 *                     keyPrefix:
 *                       type: string
 *                       example: "cc_live_a1b2c3d4"
 *                     message:
 *                       type: string
 *       400:
 *         description: Plan limit reached or freemium plan
 *       403:
 *         description: Not a member of this organization
 */
router.post('/', authenticateToken, orgApiKeyController.generateApiKey);

/**
 * @swagger
 * /api/org/{orgId}/api-keys:
 *   get:
 *     tags: [Organization - API Keys]
 *     summary: List organization's API keys
 *     description: Get all API keys for this organization. Accepts **JWT Bearer** or **org API key** (any permission). Key hashes are never returned — only metadata (prefix, status, permissions, usage counts).
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, suspended, revoked]
 *     responses:
 *       200:
 *         description: API keys retrieved
 *       403:
 *         description: Not a member of this organization
 */
router.get('/', authenticateToken, orgApiKeyController.listOrgApiKeys);

/**
 * @swagger
 * /api/org/{orgId}/api-keys/{keyId}/rotate:
 *   post:
 *     tags: [Organization - API Keys]
 *     summary: Rotate API key
 *     description: Generate new key value while keeping same keyId
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: API key rotated successfully
 */
router.post('/:keyId/rotate', authenticateToken, orgApiKeyController.rotateApiKey);

/**
 * @swagger
 * /api/org/{orgId}/api-keys/{keyId}:
 *   delete:
 *     tags: [Organization - API Keys]
 *     summary: Revoke API key
 *     description: Permanently revoke an API key
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: keyId
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
 *                 example: "properties_example"
 *     responses:
 *       200:
 *         description: API key revoked
 */
router.delete('/:keyId', authenticateToken, orgApiKeyController.revokeApiKey);

/**
 * @swagger
 * /api/org/{orgId}/api-keys/{keyId}/usage:
 *   get:
 *     tags: [Organization - API Keys]
 *     summary: Get API key usage statistics
 *     description: View usage statistics for a specific API key. Accepts **JWT Bearer** or **org API key**.
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
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
 *         description: Usage statistics retrieved
 */
router.get('/:keyId/usage', authenticateToken, orgApiKeyController.getKeyUsageStats);

module.exports = router;
