const express = require('express');
const router = express.Router();
const thresholdController = require('./threshold.controller');

const authenticateToken = require('../../../middleware/bearermiddleware');
const checkOrgAccess = require('../../../middleware/organization/checkOrgAccess');

/**
 * @swagger
 * tags:
 *   name: Thresholds
 *   description: Alert and Rule Management
 */

/**
 * @swagger
 * /api/thresholds/{id}/status:
 *   patch:
 *     tags: [Thresholds]
 *     summary: Enable or disable a threshold rule
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "id_example" }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [enabled]
 *             properties:
 *               enabled: { type: boolean, example: true }
 *     responses:
 *       200: { description: Status updated }
 */
router.patch('/thresholds/:id/status',
    authenticateToken,
    checkOrgAccess('org.thresholds.edit'),
    thresholdController.setStatus
);

/**
 * @swagger
 * /api/devices/{auid}/metadata:
 *   get:
 *     tags: [Thresholds]
 *     summary: Get sensor datapoint metadata for a device
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string, example: "GH-ENV-12345XYZ" }
 *     responses:
 *       200: { description: Datapoint metadata retrieved }
 */
router.get('/devices/:auid/metadata',
    authenticateToken,
    checkOrgAccess('org.thresholds.view'),
    thresholdController.getMetadata
);

/**
 * @swagger
 * /api/devices/{auid}/thresholds:
 *   get:
 *     tags: [Thresholds]
 *     summary: Get all threshold rules for a device
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string, example: "GH-ENV-12345XYZ" }
 *     responses:
 *       200: { description: List of thresholds }
 */
router.get('/devices/:auid/thresholds',
    authenticateToken,
    checkOrgAccess('org.thresholds.view'),
    thresholdController.getDeviceThresholds
);

/**
 * @swagger
 * /api/devices/{auid}/thresholds:
 *   post:
 *     tags: [Thresholds]
 *     summary: Create a new threshold rule
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string, example: "GH-ENV-12345XYZ" }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [datapoint, operator]
 *             properties:
 *               datapoint:
 *                 type: string
 *                 description: Sensor datapoint key (e.g., temperature, ph, ec)
 *                 example: "temperature"
 *               operator:
 *                 type: string
 *                 enum: [">", ">=", "<", "<=", "between", "outside"]
 *                 example: ">"
 *               min:
 *                 type: number
 *                 description: Minimum boundary value. Required for >, >=, between, outside.
 *                 example: 35
 *               max:
 *                 type: number
 *                 description: Maximum boundary value. Required for <, <=, between, outside.
 *                 example: 45
 *               cooldownMinutes:
 *                 type: integer
 *                 description: Alert suppression/cooldown period in minutes.
 *                 example: 30
 *               alertChannels:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Alert notification channels.
 *                 example: ["email"]
 *     responses:
 *       201: { description: Threshold created }
 */
router.post('/devices/:auid/thresholds',
    authenticateToken,
    checkOrgAccess('org.thresholds.create'),
    thresholdController.createThreshold
);

/**
 * @swagger
 * /api/thresholds/{id}:
 *   put:
 *     tags: [Thresholds]
 *     summary: Update an existing threshold rule
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "id_example" }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               datapoint:
 *                 type: string
 *                 description: Sensor datapoint key
 *                 example: "temperature"
 *               operator:
 *                 type: string
 *                 enum: [">", ">=", "<", "<=", "between", "outside"]
 *                 example: ">"
 *               min:
 *                 type: number
 *                 description: Minimum boundary value
 *                 example: 35
 *               max:
 *                 type: number
 *                 description: Maximum boundary value
 *                 example: 45
 *               cooldownMinutes:
 *                 type: integer
 *                 description: Alert cooldown period in minutes
 *                 example: 30
 *               alertChannels:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Alert notification channels
 *                 example: ["email"]
 *     responses:
 *       200: { description: Threshold updated }
 *       404: { description: Threshold not found }
 */
router.put('/thresholds/:id',
    authenticateToken,
    checkOrgAccess('org.thresholds.edit'),
    thresholdController.updateThreshold
);

/**
 * @swagger
 * /api/thresholds/{id}:
 *   delete:
 *     tags: [Thresholds]
 *     summary: Delete a threshold rule
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "id_example" }
 *     responses:
 *       200: { description: Threshold deleted }
 *       404: { description: Threshold not found }
 */
router.delete('/thresholds/:id',
    authenticateToken,
    checkOrgAccess('org.thresholds.delete'),
    thresholdController.deleteThreshold
);

/**
 * @swagger
 * /api/devices/{auid}/threshold-parameters:
 *   get:
 *     tags: [Thresholds]
 *     summary: Get valid datapoints and threshold ranges for device
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string, example: "GH-ENV-12345XYZ" }
 *     responses:
 *       200: { description: Threshold parameters retrieved }
 */
router.get('/devices/:auid/threshold-parameters',
    authenticateToken,
    checkOrgAccess('org.thresholds.view'),
    thresholdController.getParameters
);

module.exports = router;
