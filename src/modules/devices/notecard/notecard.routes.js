const express = require('express');
const router = express.Router();
const notecardController = require('./notecard.controller');

const authenticateToken = require('../../../middleware/bearermiddleware');
const checkOrgAccess = require('../../../middleware/organization/checkOrgAccess');

/**
 * @swagger
 * tags:
 *   name: Notecard
 *   description: Notehub Integration
 */

/**
 * @swagger
 * /api/devices/update-notehub-env:
 *   put:
 *     tags: [Notecard]
 *     summary: Update Notehub environment variables for a device
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Environment variables updated }
 */
router.put('/update-notehub-env',
    authenticateToken,
    checkOrgAccess('org.notecard.edit'),
    notecardController.updateDeviceEnv
);

/**
 * @swagger
 * /api/devices/get-notehub-env/{auid}:
 *   get:
 *     tags: [Notecard]
 *     summary: Get Notehub environment variables for a device
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Environment variables retrieved }
 *       404: { description: Device not found }
 */
router.get('/get-notehub-env/:auid',
    authenticateToken,
    checkOrgAccess('org.notecard.view'),
    notecardController.getDeviceEnv
);

/**
 * @swagger
 * /api/devices/delete-notehub-env/{auid}/{key}:
 *   delete:
 *     tags: [Notecard]
 *     summary: Delete a specific Notehub environment variable
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: key
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Environment variable deleted }
 *       404: { description: Device not found }
 */
router.delete('/delete-notehub-env/:auid/:key',
    authenticateToken,
    checkOrgAccess('org.notecard.delete'),
    notecardController.deleteDeviceEnv
);

/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/update-env:
 *   put:
 *     tags: [Notecard]
 *     summary: Bulk update environment variables for an entire deployment
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Deployment environment updated }
 */
router.put('/deployments/:deploymentId/update-env',
    authenticateToken,
    checkOrgAccess('org.notecard.edit'),
    notecardController.updateDeploymentEnv
);

/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/models:
 *   get:
 *     tags: [Notecard]
 *     summary: Get distinct device models in a deployment
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Models retrieved }
 */
router.get('/deployments/:deploymentId/models',
    authenticateToken,
    checkOrgAccess('org.notecard.view'),
    notecardController.getDeploymentModels
);

module.exports = router;
