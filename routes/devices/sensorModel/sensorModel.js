const express = require("express");
const { containerClient, upload, generateSignedUrl } = require("../../../config/storage/storage");
const SensorModel = require("../../../model/devices/deviceModels");
const authenticateToken = require("../../../middleware/user/bearermiddleware");
const router = express.Router();
const authorizeRoles = require('../../../middleware/user/rbacMiddleware');
const verifyApiKey = require('../../../middleware/user/apiKeymiddleware');

/**
 * @swagger
 * /api/devices/models:
 *   post:
 *     tags:
 *       - Sensor Models
 *     summary: Create a new sensor model with image
 *     description: Upload an image to Azure Blob Storage and create a sensor model with metadata.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               model:
 *                 type: string
 *               description:
 *                 type: string
 *               version:
 *                 type: number
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Model created with image successfully.
 */
router.post("/models", authenticateToken, authorizeRoles('admin','supervisor'),upload.single("image"), async (req, res) => {
  const { model, description, version } = req.body;

  if (!req.file || !model || !description) {
    return res.status(400).send({ message: "Model, description, and image are required." });
  }

  try {
    const existing = await SensorModel.findOne({ model: model.toLowerCase() });
    if (existing) {
      return res.status(409).send({ message: `Model "${model}" already exists.` });
    }

    const fileName = `upload-${Date.now()}-${req.file.originalname}`;
    const blockBlobClient = containerClient.getBlockBlobClient(fileName);
    await blockBlobClient.upload(req.file.buffer, req.file.size, {
      blobHTTPHeaders: { blobContentType: req.file.mimetype },
    });

    const signedUrl = generateSignedUrl(fileName);

    const newModel = new SensorModel({
      model: model.toLowerCase(),
      description,
      version: parseFloat(version) || 1.0,
      imageUrl: signedUrl,
    });

    await newModel.save();

    res.status(201).send({ message: `Model "${model}" created successfully with image.`, data: newModel });
  } catch (err) {
    res.status(500).send({ message: "Failed to create model", error: err.message });
  }
});

/**
 * @swagger
 * /api/devices/models:
 *   get:
 *     tags:
 *       - Sensor Models
 *     summary: Get all sensor models
 */
router.get("/models", verifyApiKey,authenticateToken,authorizeRoles('admin'),async (req, res) => {
  try {
    const models = await SensorModel.find();
    res.status(200).send({ message: "Sensor models retrieved", data: models });
  } catch (err) {
    res.status(500).send({ message: "Failed to retrieve models", error: err.message });
  }
});

/**
 * @swagger
 * /api/devices/models/search:
 *   get:
 *     tags:
 *       - Sensor Models
 *     summary: Search and filter sensor models
 */
router.get("/models/search", verifyApiKey,authenticateToken,authorizeRoles('admin'), async (req, res) => {
  const { query, version } = req.query;
  try {
    const filter = {};
    if (query) {
      filter.$or = [
        { model: { $regex: query, $options: "i" } },
        { description: { $regex: query, $options: "i" } },
      ];
    }
    if (version) {
      filter.version = parseFloat(version);
    }
    const models = await SensorModel.find(filter);
    res.status(200).send({ message: "Filtered models retrieved", data: models });
  } catch (err) {
    res.status(500).send({ message: "Search failed", error: err.message });
  }
});

/**
 * @swagger
 * /api/devices/models/uuid/{uuid}:
 *   get:
 *     tags:
 *       - Sensor Models
 *     summary: Get model by UUID
 */
router.get("/models/uuid/:uuid", verifyApiKey,authenticateToken,authorizeRoles('admin'),async (req, res) => {
  try {
    const model = await SensorModel.findOne({ uuid: req.params.uuid });
    if (!model) {
      return res.status(404).send({ message: "Model not found." });
    }
    res.status(200).send({ message: "Model retrieved by UUID", data: model });
  } catch (err) {
    res.status(500).send({ message: "Fetch by UUID failed", error: err.message });
  }
});

/**
 * @swagger
 * /api/devices/models/{model}:
 *   get:
 *     tags:
 *       - Sensor Models
 *     summary: Get a specific sensor model by name
 */
router.get("/models/:model", verifyApiKey,authenticateToken,authorizeRoles('admin'), async (req, res) => {
  const { model } = req.params;
  try {
    const data = await SensorModel.findOne({ model: model.toLowerCase() });
    if (!data) {
      return res.status(404).send({ message: `Model "${model}" not found.` });
    }
    res.status(200).send({ message: "Model retrieved successfully", data });
  } catch (err) {
    res.status(500).send({ message: "Failed to retrieve model", error: err.message });
  }
});

/**
 * @swagger
 * /api/devices/models/{model}:
 *   put:
 *     tags:
 *       - Sensor Models
 *     summary: Update a model's image or description
 */
router.put("/models/:model", verifyApiKey,authenticateToken,authorizeRoles('admin'), upload.single("image"), async (req, res) => {
  const { model } = req.params;
  const { description } = req.body;

  try {
    const existing = await SensorModel.findOne({ model: model.toLowerCase() });
    if (!existing) {
      return res.status(404).send({ message: `Model "${model}" not found.` });
    }

    let signedUrl = existing.imageUrl;
    if (req.file) {
      const fileName = `upload-${Date.now()}-${req.file.originalname}`;
      const blockBlobClient = containerClient.getBlockBlobClient(fileName);
      await blockBlobClient.upload(req.file.buffer, req.file.size, {
        blobHTTPHeaders: { blobContentType: req.file.mimetype },
      });
      signedUrl = generateSignedUrl(fileName);
    }

    existing.description = description || existing.description;
    existing.imageUrl = signedUrl;
    existing.updatedAt = Date.now();
    await existing.save();

    res.status(200).send({ message: "Model updated successfully", data: existing });
  } catch (err) {
    res.status(500).send({ message: "Update failed", error: err.message });
  }
});

/**
 * @swagger
 * /api/devices/models/{model}:
 *   delete:
 *     tags:
 *       - Sensor Models
 *     summary: Delete a model
 */
router.delete("/models/:model", verifyApiKey,authenticateToken,authorizeRoles('admin'), async (req, res) => {
  const { model } = req.params;
  try {
    const deleted = await SensorModel.findOneAndDelete({ model: model.toLowerCase() });
    if (!deleted) {
      return res.status(404).send({ message: `Model "${model}" not found.` });
    }
    res.status(200).send({ message: `Model "${model}" deleted successfully.` });
  } catch (err) {
    res.status(500).send({ message: "Delete failed", error: err.message });
  }
});

module.exports = router;

