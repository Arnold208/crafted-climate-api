const express = require('express');
const router = express.Router();
const manufacturerController = require('./manufacturer.controller');

const authorizeRoles = require('../../../middleware/rbacMiddleware');
const verifyApiKey = require('../../../middleware/apiKeymiddleware');
const authenticateToken = require('../../../middleware/bearermiddleware');

const verifyApiKeyOrTokenAdmin = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    return verifyApiKey(req, res, next);
  }
  return authenticateToken(req, res, (err) => {
    if (err) return next(err);
    return authorizeRoles('admin', 'supervisor')(req, res, next);
  });
};


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
 *     description: Manufacturer creates and stores a new device with batch tracking and unique IDs.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - devid
 *               - model
 *               - type
 *               - mac
 *               - noteDevUuid
 *             properties:
 *               devid:
 *                 type: string
 *                 example: "sensor001"
 *               model:
 *                 type: string
 *                 example: "ENV"
 *               type:
 *                 type: string
 *                 example: "Cellular"
 *               mac:
 *                 type: string
 *                 example: "C8:3A:35:AA:12:44"
 *               datapoints:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["temperature", "humidity", "pm2_5", "uv"]
 *               noteDevUuid:
 *                 type: string
 *                 description: The unique Notecard device UID.
 *                 example: "dev:861059068079643"
 *     responses:
 *       201:
 *         description: Device manufactured successfully.
 *       400:
 *         description: Missing or invalid fields.
 *       500:
 *         description: Server error.
 */
router.post('/', verifyApiKeyOrTokenAdmin, manufacturerController.createDevice);

/**
 * @swagger
 * /api/devices/manufacturer/update-note-uuid:
 *   patch:
 *     tags: [Manufacturer]
 *     summary: Update Notecard device UUID
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     description: |
 *       Allows an authenticated client (via API key) to update the Notecard device UUID (`noteDevUuid`) for a specific device.
 *       This route ensures that:
 *         - The new `noteDevUuid` does not already exist for another device.
 *         - Both manufacturer (`addDevice`) and registered device (`registerNewDevice`) records remain in sync.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - serial
 *               - newNoteDevUuid
 *             properties:
 *               serial:
 *                 type: string
 *                 description: The serial number of the device to update.
 *                 example: "12345"
 *               newNoteDevUuid:
 *                 type: string
 *                 description: The new Notecard UUID (noteDevUuid) to assign to the device.
 *                 example: "dev:861059068079643"
 *     responses:
 *       200: { description: Note UUID updated }
 *       400: { description: Invalid parameters }
 */
router.patch('/update-note-uuid', verifyApiKeyOrTokenAdmin, manufacturerController.updateNoteUuid);

/**
 * @swagger
 * /api/devices/manufacturer:
 *   get:
 *     tags: [Manufacturer]
 *     summary: List all manufactured devices
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Array of manufactured devices
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   devid: { type: string }
 *                   model: { type: string }
 *                   sku: { type: string }
 *                   mac: { type: string }
 *                   status: { type: string }
 *       403:
 *         description: Forbidden (Admin/Supervisor only)
 */
router.get('/', verifyApiKeyOrTokenAdmin, manufacturerController.getAllDevices);

/**
 * @swagger
 * /api/devices/manufacturer/{id}:
 *   get:
 *     tags: [Manufacturer]
 *     summary: Get device by manufacturing ID
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Device details found
 *       404:
 *         description: Device not found
 */
router.get('/:id', verifyApiKeyOrTokenAdmin, manufacturerController.getDeviceById);

/**
 * @swagger
 * /api/devices/manufacturer/{id}:
 *   put:
 *     tags: [Manufacturer]
 *     summary: Update a manufactured device
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Manufacturing ID of the device
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Fields allowed for manufacturer to update
 *             properties:
 *               model:
 *                 type: string
 *                 example: "ENV"
 *               type:
 *                 type: string
 *                 example: "air"
 *               mac:
 *                 type: string
 *                 example: "C8:3A:35:AA:12:44"
 *               status:
 *                 type: string
 *                 enum: [MANUFACTURED, ASSIGNED, REGISTERED]
 *                 example: "ASSIGNED"
 *               datapoints:
 *                 type: array
 *                 example: ["temperature", "humidity", "pm2_5"]
 *     responses:
 *       200:
 *         description: Device updated successfully
 *       404:
 *         description: Device not found
 */
router.put('/:id', verifyApiKeyOrTokenAdmin, manufacturerController.updateDevice);

/**
 * @swagger
 * /api/devices/manufacturer/{id}:
 *   delete:
 *     tags: [Manufacturer]
 *     summary: Delete a manufactured device
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Device deleted successfully
 *       404:
 *         description: Device not found
 */
router.delete('/:id', verifyApiKeyOrTokenAdmin, manufacturerController.deleteDevice);

module.exports = router;
