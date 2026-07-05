const express = require('express');
const router = express.Router();
const adminDeviceController = require('./adminDevice.controller');
const authenticateToken = require('../../middleware/bearermiddleware');
const authorizeRoles = require('../../middleware/rbacMiddleware');

/**
 * @swagger
 * /api/admin/devices:
 *   get:
 *     tags: [Admin Devices]
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
router.get('/', authenticateToken, authorizeRoles('admin', 'supervisor', 'support'), adminDeviceController.listDevices);

/**
 * @swagger
 * /api/admin/devices/statistics:
 *   get:
 *     tags: [Admin Devices]
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
 *                   example: 1
 *                 online:
 *                   type: integer
 *                   example: 1
 *                 offline:
 *                   type: integer
 *                   example: 1
 *                 typeBreakdown:
 *                   type: object
 */
router.get('/statistics', authenticateToken, authorizeRoles('admin', 'supervisor', 'support'), adminDeviceController.getStatistics);

/**
 * @swagger
 * /api/admin/devices/{deviceId}:
 *   delete:
 *     tags: [Admin Devices]
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
router.delete('/:deviceId', authenticateToken, authorizeRoles('admin'), adminDeviceController.removeDevice);

/**
 * @swagger
 * /api/admin/devices/offline/list:
 *   get:
 *     tags: [Admin Devices]
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
router.get('/offline/list', authenticateToken, authorizeRoles('admin', 'supervisor', 'support'), adminDeviceController.getOfflineDevices);

/**
 * @swagger
 * /api/admin/devices/{auid}/state:
 *   put:
 *     tags: [Admin Devices]
 *     summary: Set device operational state as platform admin
 *     description: Platform admin control for billing/subscription enforcement. If an admin disables a device, owners cannot reactivate it.
 *     security:
 *       - bearerAuth: []
 */
router.put('/:auid/state', authenticateToken, authorizeRoles('admin', 'supervisor'), adminDeviceController.setDeviceState);

/**
 * @swagger
 * /api/admin/devices/{deviceId}/reassign:
 *   post:
 *     tags: [Admin Devices]
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
 *                 example: "properties_example"
 *             example:
 *               organizationId: org-123456
 *     responses:
 *       200:
 *         description: Device reassigned
 *       400:
 *         description: Invalid organization
 */
router.post('/:deviceId/reassign', authenticateToken, authorizeRoles('admin', 'supervisor'), adminDeviceController.reassignDevice);

module.exports = router;
