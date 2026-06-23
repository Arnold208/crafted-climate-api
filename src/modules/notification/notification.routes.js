const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { notificationController, adminPushController } = require('./notification.controller');
const authenticateToken = require('../../middleware/bearermiddleware');

// Image upload — memory storage, 5 MB max
const uploadMiddleware = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed'), false);
        }
        cb(null, true);
    },
});

// ═══════════════════════════════════════════════════════════════════════════
// USER ROUTES  (authenticated — any logged-in user)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Get my notifications
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *       - in: query
 *         name: read
 *         schema: { type: boolean }
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [security, billing, updates, support, admin, system] }
 *     responses:
 *       200:
 *         description: Notifications returned
 */
router.get('/', authenticateToken, notificationController.getMyNotifications);

/**
 * @swagger
 * /api/notifications/{notificationId}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark notification as read
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Marked as read
 */
router.patch('/:notificationId/read', authenticateToken, notificationController.markAsRead);

/**
 * @swagger
 * /api/notifications/read-all:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark all as read
 *     security: [{ bearerAuth: [] }]
 */
router.patch('/read-all', authenticateToken, notificationController.markAllAsRead);

/**
 * @swagger
 * /api/notifications/{notificationId}:
 *   delete:
 *     tags: [Notifications]
 *     summary: Delete a notification
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema: { type: string }
 */
router.delete('/:notificationId', authenticateToken, notificationController.deleteNotification);

/**
 * @swagger
 * /api/notifications/preferences:
 *   get:
 *     tags: [Notifications]
 *     summary: Get notification preferences
 *     security: [{ bearerAuth: [] }]
 */
router.get('/preferences',  authenticateToken, notificationController.getPreferences);
router.patch('/preferences', authenticateToken, notificationController.updatePreferences);

// ── FCM Token Management ───────────────────────────────────────────────────

/**
 * @swagger
 * /api/notifications/register-token:
 *   post:
 *     tags: [Notifications]
 *     summary: Register or refresh FCM device token
 *     description: |
 *       Called by the mobile app after login or when the FCM token is refreshed.
 *       Supports multiple devices per user.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *                 description: FCM registration token from the device
 *               platform:
 *                 type: string
 *                 enum: [android, ios, web]
 *                 default: android
 *               deviceId:
 *                 type: string
 *                 description: Optional device fingerprint
 *     responses:
 *       200:
 *         description: Token registered
 */
router.post('/register-token',   authenticateToken, notificationController.registerToken);

/**
 * @swagger
 * /api/notifications/unregister-token:
 *   delete:
 *     tags: [Notifications]
 *     summary: Unregister FCM token on logout
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 */
router.delete('/unregister-token', authenticateToken, notificationController.unregisterToken);

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES  (authenticated — add your admin middleware here)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/notifications/admin/send:
 *   post:
 *     tags: [Notifications - Admin]
 *     summary: Send push notification to users
 *     description: |
 *       - target=single: instant direct send to one user (no queue)
 *       - target=group:  queued batch send to a list of users
 *       - target=all:    FCM topic broadcast to all users (most efficient)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [target, title, body]
 *             properties:
 *               target:
 *                 type: string
 *                 enum: [single, group, all]
 *               userIds:
 *                 type: array
 *                 items: { type: string }
 *                 description: Required for single/group targets
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [general, promotion, alert]
 *                 default: general
 *               imageUrl:
 *                 type: string
 *                 description: Permanent public URL from the upload-image endpoint
 *               data:
 *                 type: object
 *                 description: Extra key-value data sent to the device
 *     responses:
 *       200:
 *         description: Sent or queued
 */
router.post('/admin/send', authenticateToken, adminPushController.send.bind(adminPushController));

/**
 * @swagger
 * /api/notifications/admin/upload-image:
 *   post:
 *     tags: [Notifications - Admin]
 *     summary: Upload image for a push notification
 *     description: |
 *       Uploads an image to Azure Blob Storage and returns a PERMANENT
 *       public URL (no SAS token, never expires). Use this URL in the
 *       imageUrl field of the send endpoint.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Image uploaded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 imageUrl: { type: string }
 */
router.post(
    '/admin/upload-image',
    authenticateToken,
    uploadMiddleware.single('image'),
    adminPushController.uploadImage.bind(adminPushController)
);

/**
 * @swagger
 * /api/notifications/admin/queue-status:
 *   get:
 *     tags: [Notifications - Admin]
 *     summary: Check push notification queue status
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Queue counts (waiting, active, completed, failed, delayed)
 */
router.get('/admin/queue-status', authenticateToken, adminPushController.queueStatus.bind(adminPushController));

module.exports = router;
