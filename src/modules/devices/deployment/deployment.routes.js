const express = require('express');
const router = express.Router();
const deploymentController = require('./deployment.controller');

const authenticateToken = require('../../../middleware/bearermiddleware');
const checkOrgAccess = require('../../../middleware/organization/checkOrgAccess');

/**
 * @swagger
 * tags:
 *   name: Deployments
 *   description: Organization Deployment Management
 */

/**
 * @swagger
 * /api/deployments:
 *   post:
 *     tags: [Deployments]
 *     summary: Create a new deployment
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *     responses:
 *       201: { description: Deployment created }
 */
router.post('/deployments',
    authenticateToken,
    checkOrgAccess('org.deployments.create'),
    deploymentController.createDeployment
);

/**
 * @swagger
 * /api/deployments/{deploymentId}:
 *   get:
 *     tags: [Deployments]
 *     summary: Get a deployment by ID
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema: { type: string }
 */
router.get('/deployments/:deploymentId',
    authenticateToken,
    checkOrgAccess('org.deployments.view'),
    deploymentController.getDeployment
);

/**
 * @swagger
 * /api/deployments/{deploymentId}/devices:
 *   get:
 *     tags: [Deployments]
 *     summary: List all devices in a deployment
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema: { type: string }
 */
router.get('/deployments/:deploymentId/devices',
    authenticateToken,
    checkOrgAccess('org.deployments.view'),
    deploymentController.listDevicesInDeployment
);

/**
 * @swagger
 * /api/deployments/{deploymentId}:
 *   patch:
 *     tags: [Deployments]
 *     summary: Update deployment name or description
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema: { type: string }
 */
router.patch('/deployments/:deploymentId',
    authenticateToken,
    checkOrgAccess('org.deployments.edit'),
    deploymentController.updateDeployment
);

/**
 * @swagger
 * /api/deployments/{deploymentId}:
 *   delete:
 *     tags: [Deployments]
 *     summary: Delete a deployment
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema: { type: string }
 */
router.delete('/deployments/:deploymentId',
    authenticateToken,
    checkOrgAccess('org.deployments.delete'),
    deploymentController.deleteDeployment
);

/**
 * @swagger
 * /api/deployments/{deploymentId}/devices:
 *   post:
 *     tags: [Deployments]
 *     summary: Add a device to a deployment
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema: { type: string }
 */
router.post('/deployments/:deploymentId/devices',
    authenticateToken,
    checkOrgAccess('org.deployments.edit'),
    deploymentController.addDeviceToDeployment
);

/**
 * @swagger
 * /api/deployments/{deploymentId}/devices/{auid}:
 *   delete:
 *     tags: [Deployments]
 *     summary: Remove a device from a deployment
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 */
router.delete('/deployments/:deploymentId/devices/:auid',
    authenticateToken,
    checkOrgAccess('org.deployments.edit'),
    deploymentController.removeDeviceFromDeployment
);

/**
 * @swagger
 * /api/deployments:
 *   get:
 *     tags: [Deployments]
 *     summary: List all deployments in the organization
 */
router.get('/deployments',
    authenticateToken,
    checkOrgAccess('org.deployments.view'),
    deploymentController.listDeployments
);

module.exports = router;
