const express = require('express');
const router = express.Router();
const manufacturerController = require('./manufacturer.controller');

const authorizeRoles = require('../../../middleware/rbacMiddleware');
const verifyApiKey = require('../../../middleware/apiKeymiddleware');
const authenticateToken = require('../../../middleware/bearermiddleware');

/**
 * @swagger
 * tags:
 *   name: Manufacturer
 *   description: Device Manufacturing and Management
 */

/**
 * @swagger
 * /api/devices/manufacturer:
 *   post:
 *     tags: [Manufacturer]
 *     summary: Add a new manufactured device
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [devid, model, type, mac, noteDevUuid]
 */
router.post('/', manufacturerController.createDevice);

/**
 * @swagger
 * /api/devices/manufacturer/update-note-uuid:
 *   patch:
 *     tags: [Manufacturer]
 *     summary: Update Notecard device UUID
 */
router.patch('/update-note-uuid', manufacturerController.updateNoteUuid);

/**
 * @swagger
 * /api/devices/manufacturer:
 *   get:
 *     tags: [Manufacturer]
 *     summary: List all manufactured devices
 */
router.get('/', verifyApiKey, authenticateToken, authorizeRoles('admin', 'supervisor'), manufacturerController.getAllDevices);

/**
 * @swagger
 * /api/devices/manufacturer/{id}:
 *   get:
 *     tags: [Manufacturer]
 *     summary: Get device by manufacturing ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 */
router.get('/:id', verifyApiKey, authenticateToken, authorizeRoles('admin', 'supervisor'), manufacturerController.getDeviceById);

/**
 * @swagger
 * /api/devices/manufacturer/{id}:
 *   put:
 *     tags: [Manufacturer]
 *     summary: Update a manufactured device
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 */
router.put('/:id', verifyApiKey, authenticateToken, authorizeRoles('admin', 'supervisor'), manufacturerController.updateDevice);

/**
 * @swagger
 * /api/devices/manufacturer/{id}:
 *   delete:
 *     tags: [Manufacturer]
 *     summary: Delete a manufactured device
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 */
router.delete('/:id', verifyApiKey, authenticateToken, authorizeRoles('admin', 'supervisor'), manufacturerController.deleteDevice);

module.exports = router;
