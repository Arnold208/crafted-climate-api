const express = require('express');
const router = express.Router();
const AddDevice = require('../../../model/devices/addDevice');
const {
  generateManufacturerId,
  generateSku,
  generateBatchNumber,
  generateSerialNumber,
  generateAUID,
} = require('../../../utils/idGenerator');
const authorizeRoles = require('../../../middleware/rbacMiddleware');
const verifyApiKey = require('../../../middleware/apiKeymiddleware');
const authenticateToken = require('../../../middleware/bearermiddleware');
const SensorModel = require('../../../model/devices/deviceModels');
const registerNewDevice = require('../../../model/devices/registerDevice');

/**
 * @swagger
 * /api/devices/manufacturer:
 *   post:
 *     tags:
 *       - Manufacturer
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

router.post('/', verifyApiKey, authenticateToken, authorizeRoles('admin', 'supervisor'), async (req, res) => {
  try {
    const { devid, model, type, mac, datapoints, noteDevUuid } = req.body;

    // 🔍 Step 1: Validate input
    if (!devid || !model || !type || !mac) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // 🔍 Step 2: Check if model exists
    const sensorModel = await SensorModel.findOne({ model: model.toLowerCase() });
    if (!sensorModel) {
      return res.status(404).json({ error: `Model "${model}" not found in device models` });
    }

    // 🔍 Step 3: Prevent duplicate device or MAC
    const existing = await AddDevice.findOne({
      $or: [{ devid }, { mac }, { noteDevUuid }]
    });
    if (existingDevice) {
      let message = 'A device with this unique identifier already exists.';
      if (existingDevice.devid === devid) {
        message = 'Device with this devid already exists.';
      } else if (existingDevice.mac === mac) {
        message = 'Device with this MAC address already exists.';
      } else if (existingDevice.noteDevUuid === noteDevUuid) {
        message = 'Device with this noteDevUuid already exists.';
      }
      return res.status(409).json({ message: message });
    }

    // ✅ Step 4: Generate ONLY after all checks pass
    const manufacturingId = generateManufacturerId();
    const sku = generateSku(model);
    const batchNumber = await generateBatchNumber(); // Ensure async completes before assignment
    const auid = generateAUID();
    const serial = generateSerialNumber();

    // ✅ Step 5: Create and save the device
    const newDevice = new AddDevice({
      devid,
      model: model.toLowerCase(),
      type,
      mac,
      manufacturingId,
      sku,
      batchNumber,
      status: 'MANUFACTURED',
      datapoints,
      auid,
      serial
    });

    await newDevice.save();

    res.status(201).json({ message: 'Device manufactured successfully', device: newDevice });

  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      let duplicateKey = 'unknown';

      if (err.keyValue && Object.keys(err.keyValue).length > 0) {
        duplicateKey = Object.keys(err.keyValue)[0];
      } else if (err.message) {
        const match = err.message.match(/index:\s*(\w+)_\d+/);
        if (match && match[1]) {
          duplicateKey = match[1];
        }
      }

      return res.status(400).json({
        error: `Duplicate value for field: ${duplicateKey}`,
      });
    }

    return res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/devices/manufacturer/update-note-uuid:
 *   patch:
 *     tags:
 *       - Manufacturer
 *     summary: Update the Notecard device UUID (noteDevUuid)
 *     description: |
 *       Allows an authenticated client (via API key) to update the Notecard device UUID (`noteDevUuid`) for a specific device.
 *       This route ensures that:
 *         - The new `noteDevUuid` does not already exist for another device.
 *         - Both manufacturer (`addDevice`) and registered device (`registerNewDevice`) records remain in sync.
 *     security:
 *       - ApiKeyAuth: []   #matches your swagger.js configuration
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
 *       200:
 *         description: Successfully updated the noteDevUuid in both records.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Manufacturer device record updated successfully. Registered device record was also updated."
 *                 device:
 *                   type: object
 *                   description: The updated manufacturer device record.
 *       400:
 *         description: Missing or invalid parameters.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Both serial and newNoteDevUuid are required."
 *       404:
 *         description: Device not found in manufacturer or registered records.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Device not found in manufacturer records (addDevice)."
 *       409:
 *         description: Conflict — The new noteDevUuid already exists.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "This noteDevUuid is already in use by another device."
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Error updating device."
 *                 error:
 *                   type: string
 *                   example: "MongoServerError: E11000 duplicate key error..."
 */

router.patch('/update-note-uuid',  authorizeRoles('admin', 'supervisor'), async (req, res) => {
  const { serial, newNoteDevUuid } = req.body;

  if (!serial || !newNoteDevUuid) {
    return res.status(400).json({
      message: 'Both serial and newNoteDevUuid are required.'
    });
  }

  try {
    // 1️⃣ Ensure the new noteDevUuid isn't used by another device
    const existingDevice = await AddDevice.findOne({
      noteDevUuid: newNoteDevUuid,
      serial: { $ne: serial },
    });

    if (existingDevice) {
      return res.status(409).json({
        message: 'This noteDevUuid is already in use by another device.',
      });
    }

    // 2️⃣ Update manufacturer record (addDevice)
    const updatedAddDevice = await AddDevice.findOneAndUpdate(
      { serial },
      { $set: { noteDevUuid: newNoteDevUuid } },
      { new: true }
    );

    if (!updatedAddDevice) {
      return res.status(404).json({
        message: 'Device not found in manufacturer records (addDevice).',
      });
    }

    // 3️⃣ Update registered device record (if it exists)
    const updatedRegisteredDevice = await registerNewDevice.findOneAndUpdate(
      { serial },
      { $set: { noteDevUuid: newNoteDevUuid } },
      { new: true }
    );

    let message = 'Manufacturer device record updated successfully.';
    if (updatedRegisteredDevice) {
      message += ' Registered device record was also updated.';
    } else {
      message += ' No matching registered device found to update (this is OK).';
    }

    // ✅ 4️⃣ Respond with success
    return res.status(200).json({
      message,
      device: updatedAddDevice,
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'This noteDevUuid is already in use.',
        error: error.message,
      });
    }

    console.error('Error updating noteDevUuid:', error.message);
    return res.status(500).json({
      message: 'Error updating device',
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/devices/manufacturer:
 *   get:
 *     tags:
 *       - Manufacturer
 *     summary: List all manufactured devices
 *     responses:
 *       200:
 *         description: Array of manufactured devices.
 */
router.get('/', verifyApiKey,authenticateToken,authorizeRoles('admin','supervisor'), async (req, res) => {
  const devices = await AddDevice.find();
  res.json(devices);
});

/**
 * @swagger
 * /api/devices/manufacturer/{id}:
 *   get:
 *     tags:
 *       - Manufacturer
 *     summary: Get a device by manufacturing ID
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Manufacturing ID
 *     responses:
 *       200:
 *         description: Found device
 *       404:
 *         description: Device not found
 */
router.get('/:id', verifyApiKey , authenticateToken,authorizeRoles('admin','supervisor'), async (req, res) => {
  const device = await AddDevice.findOne({ manufacturingId: req.params.id });
  if (!device) return res.status(404).json({ error: 'Device not found' });
  res.json(device);
});

/**
 * @swagger
 * /api/devices/manufacturer/{id}:
 *   put:
 *     tags:
 *       - Manufacturer
 *     summary: Update a manufactured device
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
 *                 items:
 *                   type: string
 *                 example: ["temperature", "humidity", "pm2_5"]
 *     responses:
 *       200:
 *         description: Updated device successfully
 *       404:
 *         description: Device not found
 */

router.put('/:id',verifyApiKey,authenticateToken,authorizeRoles('admin','supervisor'), async (req, res) => {
  const updated = await AddDevice.findOneAndUpdate(
    { manufacturingId: req.params.id },
    req.body,
    { new: true }
  );
  if (!updated) return res.status(404).json({ error: 'Device not found' });
  res.json({ message: 'Device updated', device: updated });
});

/**
 * @swagger
 * /api/devices/manufacturer/{id}:
 *   delete:
 *     tags:
 *       - Manufacturer
 *     summary: Delete a manufactured device
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Manufacturing ID
 *     responses:
 *       200:
 *         description: Device deleted
 *       404:
 *         description: Device not found
 */
router.delete('/:id', verifyApiKey,authenticateToken,authorizeRoles('admin','supervisor'),async (req, res) => {
  const deleted = await AddDevice.findOneAndDelete({ manufacturingId: req.params.id });
  if (!deleted) return res.status(404).json({ error: 'Device not found' });
  res.json({ message: 'Device deleted', device: deleted });
});

module.exports = router;
