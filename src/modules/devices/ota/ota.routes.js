const express = require('express');
const router = express.Router();
const { upload } = require('../../../config/storage/storage');
const otaController = require('./ota.controller');

const authenticateToken = require('../../../middleware/bearermiddleware');
const authorizeRoles = require('../../../middleware/rbacMiddleware');
const verifyApiKey = require('../../../middleware/apiKeymiddleware');

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
 */
router.post("/upload-firmware",
    verifyApiKey,
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
 */
router.get("/latest-update",
    verifyApiKey,
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
 */
router.get("/list-firmware",
    verifyApiKey,
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
 *         schema: { type: string }
 */
router.delete("/delete-firmware/:uuid",
    verifyApiKey,
    authenticateToken,
    authorizeRoles('admin', 'supervisor'),
    otaController.deleteFirmware
);

module.exports = router;
