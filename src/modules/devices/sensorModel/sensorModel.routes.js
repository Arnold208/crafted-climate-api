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
 */
router.delete("/models/:model",
    verifyApiKey,
    authenticateToken,
    authorizeRoles('admin'),
    sensorModelController.deleteModel
);

module.exports = router;
