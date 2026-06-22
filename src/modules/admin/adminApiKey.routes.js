const express = require('express');
const router = express.Router();
const adminApiKeyController = require('./adminApiKey.controller');
const authenticateToken = require('../../middleware/bearermiddleware');
const authorizeRoles = require('../../middleware/rbacMiddleware');

/**
 * @swagger
 * /api/admin/api-keys:
 *   get:
 *     tags: [API Keys]
 *     summary: List all API keys
 *     description: Get all API keys across platform (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: organizationId
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
 *         description: Forbidden
 */
/**
 * @swagger
 * /api/admin/api-keys:
 *   post:
 *     tags: [API Keys]
 *     summary: Create a partner API key
 *     description: Admin creates a scoped API key for a partner organization. Key is shown once.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - organizationId
 *               - name
 *               - permissions
 *             properties:
 *               organizationId:
 *                 type: string
 *               name:
 *                 type: string
 *               keyType:
 *                 type: string
 *                 enum: [org, partner]
 *                 default: partner
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["mrv:projects:read", "mrv:reports:download"]
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *               rateLimit:
 *                 type: object
 *                 properties:
 *                   requests:
 *                     type: integer
 *                   windowMs:
 *                     type: integer
 *               allowedIPs:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: API key created — key shown once
 *       400:
 *         description: Validation error
 */
router.post('/', authenticateToken, authorizeRoles('admin'), adminApiKeyController.createApiKey);

/**
 * @swagger
 * /api/admin/api-keys/scopes:
 *   get:
 *     tags: [API Keys]
 *     summary: List all available permission scopes
 *     description: Returns all platform scopes grouped by resource, for use when assigning permissions to keys.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All available scopes
 */
router.get('/scopes', authenticateToken, authorizeRoles('admin', 'supervisor'), adminApiKeyController.listScopes);

router.get('/', authenticateToken, authorizeRoles('admin', 'supervisor'), adminApiKeyController.listAllApiKeys);

/**
 * @swagger
 * /api/admin/api-keys/{keyId}:
 *   get:
 *     tags: [API Keys]
 *     summary: Get API key details
 *     description: View API key details with usage stats (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: API key details retrieved
 *       404:
 *         description: API key not found
 */
router.get('/:keyId', authenticateToken, authorizeRoles('admin', 'supervisor'), adminApiKeyController.getApiKeyDetails);

/**
 * @swagger
 * /api/admin/api-keys/{keyId}/revoke:
 *   delete:
 *     tags: [API Keys]
 *     summary: Revoke API key
 *     description: Permanently revoke an API key (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
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
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "properties_example"
 *                 minLength: 10
 *             example:
 *               reason: Security breach detected
 *     responses:
 *       200:
 *         description: API key revoked
 */
router.delete('/:keyId/revoke', authenticateToken, authorizeRoles('admin'), adminApiKeyController.revokeApiKey);

/**
 * @swagger
 * /api/admin/api-keys/{keyId}/suspend:
 *   post:
 *     tags: [API Keys]
 *     summary: Suspend API key
 *     description: Temporarily suspend an API key (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: API key suspended
 */
router.post('/:keyId/suspend', authenticateToken, authorizeRoles('admin'), adminApiKeyController.suspendApiKey);

/**
 * @swagger
 * /api/admin/api-keys/{keyId}/restore:
 *   post:
 *     tags: [API Keys]
 *     summary: Restore suspended API key
 *     description: Restore a suspended API key (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: API key restored
 */
router.post('/:keyId/restore', authenticateToken, authorizeRoles('admin'), adminApiKeyController.restoreApiKey);

/**
 * @swagger
 * /api/admin/api-keys/usage/stats:
 *   get:
 *     tags: [API Keys]
 *     summary: Get platform-wide API key usage statistics
 *     description: View usage statistics across all API keys (Platform Admin only)
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
 *         description: Usage statistics retrieved
 */
router.get('/usage/stats', authenticateToken, authorizeRoles('admin', 'supervisor'), adminApiKeyController.getPlatformUsageStats);

module.exports = router;
