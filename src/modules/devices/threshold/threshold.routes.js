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
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [enabled]
 *             properties:
 *               enabled: { type: boolean }
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
 *         schema: { type: string }
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
 *         schema: { type: string }
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
 *         schema: { type: string }
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
 *         schema: { type: string }
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
 *         schema: { type: string }
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
 *         schema: { type: string }
 */
router.get('/devices/:auid/threshold-parameters',
    authenticateToken,
    checkOrgAccess('org.thresholds.view'),
    thresholdController.getParameters
);

module.exports = router;
