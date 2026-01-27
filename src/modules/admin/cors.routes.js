const express = require('express');
const router = express.Router();
const corsController = require('./cors.controller');
const authenticateToken = require('../../middleware/bearermiddleware');

// Middleware to check platform admin role
const requirePlatformAdmin = (req, res, next) => {
    if (req.user.platformRole !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Forbidden: Platform admin access required'
        });
    }
    next();
};

/**
 * @swagger
 * /api/admin/cors:
 *   get:
 *     tags: [System Config]
 *     summary: Get current CORS settings
 *     description: Retrieve the current CORS configuration (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CORS settings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     enabled:
 *                       type: boolean
 *                     allowedOrigins:
 *                       type: array
 *                       items:
 *                         type: string
 *                     allowCredentials:
 *                       type: boolean
 *       403:
 *         description: Forbidden - Platform admin access required
 */
router.get('/', authenticateToken, requirePlatformAdmin, corsController.getSettings);

/**
 * @swagger
 * /api/admin/cors:
 *   put:
 *     tags: [System Config]
 *     summary: Update CORS settings
 *     description: Update all CORS configuration settings (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *                 description: Enable/disable CORS enforcement
 *               allowedOrigins:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of allowed origins (at least one required)
 *               allowCredentials:
 *                 type: boolean
 *                 description: Allow credentials (cookies, auth headers)
 *             example:
 *               enabled: true
 *               allowedOrigins: ["https://app.craftedclimate.com", "https://admin.craftedclimate.com"]
 *               allowCredentials: true
 *     responses:
 *       200:
 *         description: CORS settings updated successfully
 *       400:
 *         description: Invalid request (e.g., empty origins array)
 *       403:
 *         description: Forbidden - Platform admin access required
 */
router.put('/', authenticateToken, requirePlatformAdmin, corsController.updateSettings);

/**
 * @swagger
 * /api/admin/cors/origins:
 *   post:
 *     tags: [System Config]
 *     summary: Add allowed origin
 *     description: Add a single origin to the allowed list (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - origin
 *             properties:
 *               origin:
 *                 type: string
 *                 description: Origin to add (must be valid URL or *)
 *             example:
 *               origin: "https://new-app.craftedclimate.com"
 *     responses:
 *       200:
 *         description: Origin added successfully
 *       400:
 *         description: Invalid origin format or already exists
 *       403:
 *         description: Forbidden - Platform admin access required
 */
router.post('/origins', authenticateToken, requirePlatformAdmin, corsController.addOrigin);

/**
 * @swagger
 * /api/admin/cors/origins:
 *   delete:
 *     tags: [System Config]
 *     summary: Remove allowed origin
 *     description: Remove a single origin from the allowed list (Platform Admin only). Cannot remove the last origin.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - origin
 *             properties:
 *               origin:
 *                 type: string
 *                 description: Origin to remove
 *             example:
 *               origin: "https://old-app.craftedclimate.com"
 *     responses:
 *       200:
 *         description: Origin removed successfully
 *       400:
 *         description: Cannot remove last origin or origin not found
 *       403:
 *         description: Forbidden - Platform admin access required
 */
router.delete('/origins', authenticateToken, requirePlatformAdmin, corsController.removeOrigin);

/**
 * @swagger
 * /api/admin/cors/toggle:
 *   patch:
 *     tags: [System Config]
 *     summary: Toggle CORS enforcement
 *     description: Enable or disable CORS enforcement globally (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enabled
 *             properties:
 *               enabled:
 *                 type: boolean
 *                 description: true = enforce whitelist, false = allow all origins
 *             example:
 *               enabled: false
 *     responses:
 *       200:
 *         description: CORS enforcement toggled successfully
 *       400:
 *         description: Invalid request
 *       403:
 *         description: Forbidden - Platform admin access required
 */
router.patch('/toggle', authenticateToken, requirePlatformAdmin, corsController.toggleEnforcement);

/**
 * @swagger
 * /api/admin/cors/history:
 *   get:
 *     tags: [System Config]
 *     summary: Get CORS change history
 *     description: Retrieve the last 10 CORS configuration changes (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Change history retrieved successfully
 *       403:
 *         description: Forbidden - Platform admin access required
 */
router.get('/history', authenticateToken, requirePlatformAdmin, corsController.getHistory);

module.exports = router;
