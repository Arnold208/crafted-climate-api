const express = require("express");
const { generateFirmwareId } = require('../../../utils/idGenerator');
const OTAUpdate = require("../../../model/ota/otaModel");
const { containerClient, upload, generateSignedUrl } = require("../../../config/storage/storage");
const authenticateToken = require('../../../middleware/bearermiddleware');
const SensorModel = require("../../../model/devices/deviceModels");
const authorizeRoles = require('../../../middleware/rbacMiddleware');
const verifyApiKey = require('../../../middleware/apiKeymiddleware');

const router = express.Router();

/**
 * @swagger
 * /api/devices/upload-firmware:
 *   post:
 *     tags:
 *       - Firmware
 *     summary: Upload .bin firmware to Azure Blob Storage
 *     description: This endpoint allows uploading a `.bin` firmware file to Azure Blob Storage. It verifies that the sensor model exists and saves firmware metadata in MongoDB.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - firmware
 *               - firmware_version
 *               - hardware_version
 *               - model
 *               - author
 *             properties:
 *               firmware:
 *                 type: string
 *                 format: binary
 *                 description: The `.bin` firmware file to upload
 *               firmware_version:
 *                 type: string
 *                 example: "1.0.0"
 *               hardware_version:
 *                 type: string
 *                 example: "v1.0"
 *               model:
 *                 type: string
 *                 example: "crowdsense-env"
 *               author:
 *                 type: string
 *                 example: "Engineer Kim"
 *     responses:
 *       201:
 *         description: Firmware uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 firmware_url:
 *                   type: string
 *                 firmware_version:
 *                   type: string
 *                 hardware_version:
 *                   type: string
 *       400:
 *         description: Invalid request (bad model or file type)
 *       500:
 *         description: Internal server error
 */

router.post("/upload-firmware", verifyApiKey,authenticateToken,authorizeRoles('admin'),upload.single("firmware"), async (req, res) => {
  try {
    const { firmware_version, hardware_version, model, author } = req.body;

    // Validate .bin file presence
    if (!req.file || !req.file.originalname.endsWith(".bin")) {
      return res.status(400).json({ error: "Only .bin firmware files are allowed." });
    }

    // Ensure model exists
    const modelExists = await SensorModel.findOne({ model: model.toLowerCase() });
    if (!modelExists) {
      return res.status(400).json({ error: "Sensor model does not exist. Please register the model first." });
    }

    // Check if firmware version already exists for this model
    const versionExists = await OTAUpdate.findOne({ model, firmware_version });
    if (versionExists) {
      return res.status(400).json({ error: "Firmware version already exists for this model." });
    }

    // Generate UUID and blob name
    const uuid = generateFirmwareId();
    const blobName = `firmware/${uuid}.bin`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Upload to Azure Blob
    await blockBlobClient.uploadData(req.file.buffer, {
      blobHTTPHeaders: { blobContentType: req.file.mimetype || "application/octet-stream" }
    });

    const signedUrl = generateSignedUrl(blobName);

    // Save firmware metadata
    const newFirmware = new OTAUpdate({
      uuid,
      firmware_version,
      hardware_version,
      model,
      firmware_url: signedUrl,
      author
    });

    await newFirmware.save();

    res.status(201).json({
      message: "Firmware uploaded successfully",
      firmware_url: signedUrl,
      firmware_version,
      hardware_version
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


/**
 * @swagger
 * /api/devices/latest-update:
 *   get:
 *     tags:
 *       - Firmware
 *     summary: Check for the latest firmware update for a device
 *     description: This endpoint allows you to check if there is a firmware update for a specific device by firmware version, hardware version, and model.
 *     parameters:
 *       - in: query
 *         name: firmware_version
 *         type: string
 *         description: Version of the firmware
 *         required: true
 *       - in: query
 *         name: hardware_version
 *         type: string
 *         description: Version of the hardware
 *         required: true
 *       - in: query
 *         name: model
 *         type: string
 *         description: Model of the device
 *         required: true
 *     responses:
 *       200:
 *         description: Latest firmware details
 *         schema:
 *           type: object
 *           properties:
 *             firmware_url:
 *               type: string
 *               example: "https://yourazurebloburl.com/firmware/12345.zip"
 *             firmware_version:
 *               type: string
 *               example: "1.0.1"
 *             hardware_version:
 *               type: string
 *               example: "v1"
 *             model:
 *               type: string
 *               example: "DeviceModelX"
 *             uploadedAt:
 *               type: string
 *               format: date-time
 *       404:
 *         description: No update found for the specified device
 */
router.get("/latest-update", verifyApiKey,authenticateToken,authorizeRoles('admin','supervisor'),async (req, res) => {
  try {
    const { firmware_version, hardware_version, model } = req.query;

    if (!firmware_version || !hardware_version || !model) {
      return res.status(400).json({ message: "Please provide firmware_version, hardware_version, and model." });
    }

    const candidates = await OTAUpdate.find({
      model,
      firmware_version: { $gt: firmware_version },
      hardware_version: { $gte: hardware_version }  // Allow same hardware version but newer firmware
    });

    if (!candidates || candidates.length === 0) {
      return res.status(404).json({ message: "No update found for the specified device." });
    }

    const latestFirmware = candidates.reduce((latest, current) =>
      new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest, candidates[0]
    );

    res.status(200).json({
      firmware_url: latestFirmware.firmware_url,
      firmware_version: latestFirmware.firmware_version,
      hardware_version: latestFirmware.hardware_version,
      model: latestFirmware.model,
      createdAt: latestFirmware.createdAt
    });

  } catch (error) {
    console.error("Error checking latest update:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Route to list all firmware uploads
/**
 * @swagger
 * /api/devices/list-firmware:
 *   get:
 *     tags:
 *       - Firmware
 *     summary: List all firmware uploads
 *     description: This endpoint allows you to retrieve a list of all firmware uploads stored in MongoDB.
 *     responses:
 *       200:
 *         description: A list of all firmware uploads
 *         schema:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               uuid:
 *                 type: string
 *               firmware_version:
 *                 type: string
 *               hardware_version:
 *                 type: string
 *               model:
 *                 type: string
 *               firmware_url:
 *                 type: string
 *               author:
 *                 type: string
 *               uploadedAt:
 *                 type: string
 *                 format: date-time
 */
router.get("/list-firmware", verifyApiKey,authenticateToken,authorizeRoles('admin','supervisor'),async (req, res) => {
    try {
        const firmwareList = await OTAUpdate.find();
        res.status(200).json(firmwareList);
    } catch (error) {
        console.error("Error fetching firmware list:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * @swagger
 * /api/devices/delete-firmware/{uuid}:
 *   delete:
 *     tags:
 *       - Firmware
 *     summary: Delete firmware by UUID
 *     description: This endpoint allows you to delete a firmware upload by UUID.
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         description: UUID of the firmware to be deleted
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Firmware deleted successfully
 *       404:
 *         description: Firmware not found
 *       500:
 *         description: Internal server error
 */
router.delete("/delete-firmware/:uuid",verifyApiKey,authenticateToken,authorizeRoles('admin','supervisor'), async (req, res) => {
    try {
        const { uuid } = req.params;
        const deletedFirmware = await OTAUpdate.findOneAndDelete({ uuid });

        if (!deletedFirmware) {
            return res.status(404).json({ error: "Firmware not found" });
        }

        res.status(200).json({ message: "Firmware deleted successfully" });
    } catch (error) {
        console.error("Error deleting firmware:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
module.exports = router;
