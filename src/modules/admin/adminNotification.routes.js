const express = require('express');
const router = express.Router();
const adminNotificationController = require('./adminNotification.controller');
const authenticateToken = require('../../middleware/bearermiddleware');
const requirePlatformAdmin = require('../../middleware/requirePlatformAdmin');

/**
 * @swagger
 * /api/admin/notifications/send:
 *   post:
 *     tags: [Platform Admin - Notifications]
 *     summary: Send notification to specific users
 *     description: Send notification to selected users (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userids
 *               - title
 *               - message
 *               - category
 *             properties:
 *               userids:
 *                 type: array
 *                 items:
 *                   type: string
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [info, success, warning, error, system]
 *               category:
 *                 type: string
 *                 enum: [security, billing, updates, support, admin, system]
 *               actionUrl:
 *                 type: string
 *               channels:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [in_app, email, push]
 *             example:
 *               userids: [user1, user2]
 *               title: System Maintenance
 *               message: Scheduled maintenance tonight
 *               type: info
 *               category: system
 *               channels: [in_app, email]
 *     responses:
 *       201:
 *         description: Notification sent
 */
router.post('/send', authenticateToken, requirePlatformAdmin, adminNotificationController.sendNotification);

/**
 * @swagger
 * /api/admin/notifications/broadcast:
 *   post:
 *     tags: [Platform Admin - Notifications]
 *     summary: Broadcast notification to all users
 *     description: Send notification to all users with optional filters (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - message
 *               - category
 *             properties:
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [info, success, warning, error, system]
 *               category:
 *                 type: string
 *                 enum: [security, billing, updates, support, admin, system]
 *               role:
 *                 type: string
 *                 description: Filter by user role
 *               verified:
 *                 type: boolean
 *                 description: Filter by verified status
 *               actionUrl:
 *                 type: string
 *               channels:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [in_app, email, push]
 *     responses:
 *       201:
 *         description: Notification broadcast
 */
router.post('/broadcast', authenticateToken, requirePlatformAdmin, adminNotificationController.broadcastToAll);

/**
 * @swagger
 * /api/admin/notifications/statistics:
 *   get:
 *     tags: [Platform Admin - Notifications]
 *     summary: Get notification statistics
 *     description: View notification metrics (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userid
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
 *         description: Statistics retrieved
 */
router.get('/statistics', authenticateToken, requirePlatformAdmin, adminNotificationController.getStatistics);

module.exports = router;
