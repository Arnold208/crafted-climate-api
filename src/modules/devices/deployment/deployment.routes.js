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
 * /api/devices/deployments:
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
 * /api/devices/deployments/{deploymentId}:
 *   get:
 *     tags: [Deployments]
 *     summary: Get a deployment by ID
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Deployment details retrieved }
 *       404: { description: Deployment not found }
 */
router.get('/deployments/:deploymentId',
    authenticateToken,
    checkOrgAccess('org.deployments.view'),
    deploymentController.getDeployment
);

/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/devices:
 *   get:
 *     tags: [Deployments]
 *     summary: List all devices in a deployment
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Devices in deployment retrieved }
 */
router.get('/deployments/:deploymentId/devices',
    authenticateToken,
    checkOrgAccess('org.deployments.view'),
    deploymentController.listDevicesInDeployment
);

/**
 * @swagger
 * /api/devices/deployments/{deploymentId}:
 *   patch:
 *     tags: [Deployments]
 *     summary: Update deployment name or description
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Deployment updated }
 *       404: { description: Deployment not found }
 */
router.patch('/deployments/:deploymentId',
    authenticateToken,
    checkOrgAccess('org.deployments.edit'),
    deploymentController.updateDeployment
);

/**
 * @swagger
 * /api/devices/deployments/{deploymentId}:
 *   delete:
 *     tags: [Deployments]
 *     summary: Delete a deployment
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Deployment deleted }
 *       404: { description: Deployment not found }
 */
router.delete('/deployments/:deploymentId',
    authenticateToken,
    checkOrgAccess('org.deployments.delete'),
    deploymentController.deleteDeployment
);

/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/collaborators:
 *   post:
 *     tags: [Deployments]
 *     summary: Add a collaborator to the deployment
 *     description: Adding a collaborator here AUTOMATICALLY adds them to all devices in the deployment.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string }
 *               role: { type: string, enum: ['deployment-admin', 'deployment-support', 'deployment-user'] }
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201: { description: Collaborator added }
 */
router.post('/deployments/:deploymentId/collaborators',
    authenticateToken,
    checkOrgAccess('org.deployments.edit'),
    deploymentController.addCollaborator
);

/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/collaborators:
 *   delete:
 *     tags: [Deployments]
 *     summary: Remove a collaborator from the deployment
 *     description: Removing a collaborator here AUTOMATICALLY removes them from all devices in the deployment.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string }
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Collaborator removed }
 */
router.delete('/deployments/:deploymentId/collaborators',
    authenticateToken,
    checkOrgAccess('org.deployments.edit'),
    deploymentController.removeCollaborator
);

/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/devices:
 *   post:
 *     tags: [Deployments]
 *     summary: Add a device to a deployment
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Device added to deployment }
 */
router.post('/deployments/:deploymentId/devices',
    authenticateToken,
    checkOrgAccess('org.deployments.edit'),
    deploymentController.addDeviceToDeployment
);

/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/devices/{auid}:
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
 *     responses:
 *       200: { description: Device removed from deployment }
 */
router.delete('/deployments/:deploymentId/devices/:auid',
    authenticateToken,
    checkOrgAccess('org.deployments.edit'),
    deploymentController.removeDeviceFromDeployment
);

/**
 * @swagger
 * /api/devices/deployments:
 *   get:
 *     tags: [Deployments]
 *     summary: List all deployments in the organization
 *     responses:
 *       200: { description: Deployments list retrieved }
 */
router.get('/deployments',
    authenticateToken,
    checkOrgAccess('org.deployments.view'),
    deploymentController.listDeployments
);

module.exports = router;
