const express = require('express');
const router = express.Router();
const { upload } = require('../../../config/storage/storage');
const sensorModelController = require('./sensorModel.controller');

const authenticateToken = require('../../../middleware/bearermiddleware');
const authorizeRoles    = require('../../../middleware/rbacMiddleware');

// System-admin only — JWT login required, admin or supervisor role
const adminOnly = [authenticateToken, authorizeRoles('admin', 'supervisor')];

/**
 * @swagger
 * tags:
 *   name: Sensor Models
 *   description: Sensor Model Management
 */

/**
 * @swagger
 * /api/devices/models:
 *   post:
 *     tags: [Sensor Models]
 *     summary: Create a new sensor model with image
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
 *                 example: "ENV"
 *                 description: Name of the sensor model (e.g., SCD4x)
 *               description:
 *                 type: string
 *                 example: "Battery level has dropped below 15% threshold."
 *                 description: Brief description of the sensor
 *               version:
 *                 type: string
 *                 example: "1.2.0"
 *                 description: Version of the model (defaults to 1.0)
 *               image:
 *                 type: string
 *                 example: "properties_example"
 *                 format: binary
 *                 description: Image file for the sensor model
 *             required:
 *               - model
 *               - description
 *               - image
 *     responses:
 *       201: { description: Sensor model created }
 *       400: { description: Missing fields or image }
 */
router.post("/models",
    authenticateToken,
    authorizeRoles('admin', 'supervisor'),
    upload.single("image"),
    sensorModelController.createModel
);

/**
 * @swagger
 * /api/devices/models:
 *   get:
 *     tags: [Sensor Models]
 *     summary: Get all sensor models
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200: { description: List of sensor models }
 */
router.get("/models",
    ...adminOnly,
    authenticateToken,
    authorizeRoles('admin'),
    sensorModelController.getAllModels
);

/**
 * @swagger
 * /api/devices/models/search:
 *   get:
 *     tags: [Sensor Models]
 *     summary: Search and filter sensor models
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200: { description: Search results }
 */
router.get("/models/search",
    ...adminOnly,
    authenticateToken,
    authorizeRoles('admin'),
    sensorModelController.searchModels
);

/**
 * @swagger
 * /api/devices/models/uuid/{uuid}:
 *   get:
 *     tags: [Sensor Models]
 *     summary: Get model by UUID
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200: { description: Sensor model details }
 *       404: { description: Model not found }
 */
router.get("/models/uuid/:uuid",
    ...adminOnly,
    authenticateToken,
    authorizeRoles('admin'),
    sensorModelController.getModelByUuid
);

/**
 * @swagger
 * /api/devices/models/{model}:
 *   get:
 *     tags: [Sensor Models]
 *     summary: Get a specific sensor model by name
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200: { description: Sensor model details }
 *       404: { description: Model not found }
 */
router.get("/models/:model",
    ...adminOnly,
    authenticateToken,
    authorizeRoles('admin'),
    sensorModelController.getModelByName
);

/**
 * @swagger
 * /api/devices/models/{model}:
 *   put:
 *     tags: [Sensor Models]
 *     summary: Update a model's image or description
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *                 example: "Battery level has dropped below 15% threshold."
 *                 description: Updated description
 *               image:
 *                 type: string
 *                 example: "properties_example"
 *                 format: binary
 *                 description: New image file
 *     responses:
 *       200: { description: Model updated }
 *       404: { description: Model not found }
 */
router.put("/models/:model",
    ...adminOnly,
    authenticateToken,
    authorizeRoles('admin'),
    upload.single("image"),
    sensorModelController.updateModel
);

/**
 * @swagger
 * /api/devices/models/{model}:
 *   delete:
 *     tags: [Sensor Models]
 *     summary: Delete a model
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200: { description: Model deleted }
 *       404: { description: Model not found }
 */
router.delete("/models/:model",
    ...adminOnly,
    authenticateToken,
    authorizeRoles('admin'),
    sensorModelController.deleteModel
);

module.exports = router;
