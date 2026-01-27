const express = require('express');
const router = express.Router();
const announcementController = require('./announcement.controller');
const authenticateToken = require('../../middleware/bearermiddleware');
const requirePlatformAdmin = require('../../middleware/requirePlatformAdmin');

/**
 * @swagger
 * /api/admin/announcements:
 *   post:
 *     tags: [System Config]
 *     summary: Create platform announcement
 *     description: Create announcement for users (Platform Admin only)
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
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 200
 *               message:
 *                 type: string
 *                 maxLength: 2000
 *               type:
 *                 type: string
 *                 enum: [info, warning, success, error, maintenance]
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *               targetAudience:
 *                 type: string
 *                 enum: [all, admins, users, organizations]
 *               endDate:
 *                 type: string
 *                 format: date-time
 *             example:
 *               title: System Upgrade Scheduled
 *               message: We will be upgrading our systems on Friday
 *               type: info
 *               priority: medium
 *               targetAudience: all
 *     responses:
 *       201:
 *         description: Announcement created
 */
router.post('/', authenticateToken, requirePlatformAdmin, announcementController.createAnnouncement);

/**
 * @swagger
 * /api/admin/announcements:
 *   get:
 *     tags: [System Config]
 *     summary: List all announcements
 *     description: Get all platform announcements (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [info, warning, success, error, maintenance]
 *       - in: query
 *         name: targetAudience
 *         schema:
 *           type: string
 *           enum: [all, admins, users, organizations]
 *     responses:
 *       200:
 *         description: Announcements retrieved
 */
router.get('/', authenticateToken, requirePlatformAdmin, announcementController.listAnnouncements);

/**
 * @swagger
 * /api/admin/announcements/{announcementId}:
 *   patch:
 *     tags: [System Config]
 *     summary: Update announcement
 *     description: Update announcement details (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: announcementId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Announcement updated
 */
router.patch('/:announcementId', authenticateToken, requirePlatformAdmin, announcementController.updateAnnouncement);

/**
 * @swagger
 * /api/admin/announcements/{announcementId}:
 *   delete:
 *     tags: [System Config]
 *     summary: Delete announcement
 *     description: Delete announcement (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: announcementId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Announcement deleted
 */
router.delete('/:announcementId', authenticateToken, requirePlatformAdmin, announcementController.deleteAnnouncement);

module.exports = router;
