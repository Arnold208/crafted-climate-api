const express = require('express');
const router = express.Router();
const { upload } = require('../../../config/storage/storage');
const otaController = require('./ota.controller');

const authenticateToken = require('../../../middleware/bearermiddleware');
const authorizeRoles    = require('../../../middleware/rbacMiddleware');

// System-admin only — JWT login required, admin or supervisor role
const adminOnly = [authenticateToken, authorizeRoles('admin', 'supervisor')];

/**
 * @swagger
 * tags:
 *   name: Firmware
 *   description: OTA Firmware Management
 */

/**
 * @swagger
 * /api/devices/upload-firmware:
 *   post:
 *     tags: [Firmware]
 *     summary: Upload firmware binary
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201: { description: Firmware uploaded successfully }
 *       400: { description: No file uploaded }
 */
router.post("/upload-firmware",
    ...adminOnly,
    authenticateToken,
    authorizeRoles('admin'),
    upload.single("firmware"),
    otaController.uploadFirmware
);

/**
 * @swagger
 * /api/devices/latest-update:
 *   get:
 *     tags: [Firmware]
 *     summary: Check for the latest firmware update
 *     responses:
 *       200: { description: Latest version check result }
 */
router.get("/latest-update",
    ...adminOnly,
    authenticateToken,
    authorizeRoles('admin', 'supervisor'),
    otaController.getLatestUpdate
);

/**
 * @swagger
 * /api/devices/list-firmware:
 *   get:
 *     tags: [Firmware]
 *     summary: List all firmware uploads
 *     responses:
 *       200: { description: Firmware list retrieved }
 */
router.get("/list-firmware",
    ...adminOnly,
    authenticateToken,
    authorizeRoles('admin', 'supervisor'),
    otaController.listFirmware
);

/**
 * @swagger
 * /api/devices/delete-firmware/{uuid}:
 *   delete:
 *     tags: [Firmware]
 *     summary: Delete a firmware upload
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema: { type: string, example: "uuid-9b1deb4d-3b7d-4bad" }
 *     responses:
 *       200: { description: Firmware deleted }
 *       404: { description: Firmware not found }
 */
router.delete("/delete-firmware/:uuid",
    ...adminOnly,
    authenticateToken,
    authorizeRoles('admin', 'supervisor'),
    otaController.deleteFirmware
);

module.exports = router;
