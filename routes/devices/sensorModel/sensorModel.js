const express = require("express");
const { containerClient, upload, generateSignedUrl } = require("../../../config/storage/storage");
const SensorModel = require("../../../model/devices/deviceModels");
const authenticateToken = require("../../../middleware/bearermiddleware");
const router = express.Router();
const authorizeRoles = require('../../../middleware/rbacMiddleware');
const verifyApiKey = require('../../../middleware/apiKeymiddleware');

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
router.post("/models", authenticateToken, authorizeRoles('admin', 'supervisor'), upload.single("image"), async (req, res) => {
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
 *     security:
 *       - bearerAuth: []
 */
router.get("/models", authenticateToken, authorizeRoles('admin', 'supervisor', 'user'), async (req, res) => {
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
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: Search term for model name or description
 *       - in: query
 *         name: version
 *         schema:
 *           type: number
 *         description: Filter by version number
 *     responses:
 *       200:
 *         description: List of matching models
 *       500:
 *         description: Search failed
 *     security:
 *       - bearerAuth: []
 */
router.get("/models/search", authenticateToken, authorizeRoles('admin', 'supervisor', 'user'), async (req, res) => {
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
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *         description: The UUID of the sensor model
 *     responses:
 *       200:
 *         description: Model details
 *       404:
 *         description: Model not found
 *       500:
 *         description: Server error
 *     security:
 *       - bearerAuth: []
 */
router.get("/models/uuid/:uuid", authenticateToken, authorizeRoles('admin', 'supervisor', 'user'), async (req, res) => {
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
 *     parameters:
 *       - in: path
 *         name: model
 *         required: true
 *         schema:
 *           type: string
 *         description: The name of the model (case-insensitive)
 *     responses:
 *       200:
 *         description: Model details
 *       404:
 *         description: Model not found
 *       500:
 *         description: Server error
 *     security:
 *       - bearerAuth: []
 */
router.get("/models/:model", authenticateToken, authorizeRoles('admin', 'supervisor', 'user'), async (req, res) => {
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
 *     parameters:
 *       - in: path
 *         name: model
 *         required: true
 *         schema:
 *           type: string
 *         description: The name of the model to update
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Model updated successfully
 *       404:
 *         description: Model not found
 *       500:
 *         description: Update failed
 *     security:
 *       - bearerAuth: []
 */
router.put("/models/:model", authenticateToken, authorizeRoles('admin'), upload.single("image"), async (req, res) => {
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
 *     parameters:
 *       - in: path
 *         name: model
 *         required: true
 *         schema:
 *           type: string
 *         description: The name of the model to delete
 *     responses:
 *       200:
 *         description: Model deleted successfully
 *       404:
 *         description: Model not found
 *       500:
 *         description: Delete failed
 *     security:
 *       - bearerAuth: []
 */
router.delete("/models/:model", authenticateToken, authorizeRoles('admin'), async (req, res) => {
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

