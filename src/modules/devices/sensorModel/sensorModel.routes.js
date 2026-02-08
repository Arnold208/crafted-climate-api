const express = require('express');
const router = express.Router();
const { upload } = require('../../../config/storage/storage');
const sensorModelController = require('./sensorModel.controller');

const authorizeRoles = require('../../../middleware/rbacMiddleware');
const verifyApiKey = require('../../../middleware/apiKeymiddleware');
const authenticateToken = require('../../../middleware/bearermiddleware');

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
 *     responses:
 *       200: { description: List of sensor models }
 */
router.get("/models",
    verifyApiKey,
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
 *     responses:
 *       200: { description: Search results }
 */
router.get("/models/search",
    verifyApiKey,
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
 *     responses:
 *       200: { description: Sensor model details }
 *       404: { description: Model not found }
 */
router.get("/models/uuid/:uuid",
    verifyApiKey,
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
 *     responses:
 *       200: { description: Sensor model details }
 *       404: { description: Model not found }
 */
router.get("/models/:model",
    verifyApiKey,
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
 *     responses:
 *       200: { description: Model updated }
 *       404: { description: Model not found }
 */
router.put("/models/:model",
    verifyApiKey,
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
 *     responses:
 *       200: { description: Model deleted }
 *       404: { description: Model not found }
 */
router.delete("/models/:model",
    verifyApiKey,
    authenticateToken,
    authorizeRoles('admin'),
    sensorModelController.deleteModel
);

module.exports = router;
