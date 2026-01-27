const express = require('express');
const router = express.Router();
const adminDeviceController = require('./adminDevice.controller');
const authenticateToken = require('../../middleware/bearermiddleware');
const requirePlatformAdmin = require('../../middleware/requirePlatformAdmin');

/**
 * @swagger
 * /api/admin/devices:
 *   get:
 *     tags: [Devices]
 *     summary: List all devices
 *     description: Get platform-wide device list with filters (Platform Admin only)
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
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by device ID, serial, or nickname
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [online, offline]
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Devices retrieved
 *       403:
 *         description: Forbidden
 */
router.get('/', authenticateToken, requirePlatformAdmin, adminDeviceController.listDevices);

/**
 * @swagger
 * /api/admin/devices/statistics:
 *   get:
 *     tags: [Devices]
 *     summary: Get device statistics
 *     description: Get platform-wide device statistics (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                 online:
 *                   type: integer
 *                 offline:
 *                   type: integer
 *                 typeBreakdown:
 *                   type: object
 */
router.get('/statistics', authenticateToken, requirePlatformAdmin, adminDeviceController.getStatistics);

/**
 * @swagger
 * /api/admin/devices/{deviceId}:
 *   delete:
 *     tags: [Devices]
 *     summary: Remove device
 *     description: Permanently delete device (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Device deleted
 *       404:
 *         description: Device not found
 */
router.delete('/:deviceId', authenticateToken, requirePlatformAdmin, adminDeviceController.removeDevice);

/**
 * @swagger
 * /api/admin/devices/offline/list:
 *   get:
 *     tags: [Devices]
 *     summary: Get offline devices
 *     description: List devices offline for more than specified hours (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: hours
 *         schema:
 *           type: integer
 *           default: 24
 *         description: Threshold in hours
 *     responses:
 *       200:
 *         description: Offline devices retrieved
 */
router.get('/offline/list', authenticateToken, requirePlatformAdmin, adminDeviceController.getOfflineDevices);

/**
 * @swagger
 * /api/admin/devices/{deviceId}/reassign:
 *   post:
 *     tags: [Devices]
 *     summary: Reassign device to different organization
 *     description: Transfer device to another organization (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
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
 *               - organizationId
 *             properties:
 *               organizationId:
 *                 type: string
 *             example:
 *               organizationId: org-123456
 *     responses:
 *       200:
 *         description: Device reassigned
 *       400:
 *         description: Invalid organization
 */
router.post('/:deviceId/reassign', authenticateToken, requirePlatformAdmin, adminDeviceController.reassignDevice);

module.exports = router;
