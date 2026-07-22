const express = require('express');
const router = express.Router();
const deploymentController = require('./deployment.controller');

const authenticateToken = require('../../../middleware/bearermiddleware');
const checkOrgAccess = require('../../../middleware/organization/checkOrgAccess');
const { requirePermission } = require('../../../middleware/authenticateApiKey');
const { upload } = require('../../../config/storage/storage');

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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Accra Central School"
 *               description:
 *                 type: string
 *                 example: "Urban Office monitoring station."
 *               siteType:
 *                 type: string
 *                 example: "Urban Office"
 *               location:
 *                 type: string
 *                 description: Comma-separated or JSON array coordinates [latitude, longitude]
 *                 example: "5.601, -0.187"
 *               nextMaintenanceDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-08-20T12:00:00Z"
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Image file to upload for the deployment/site
 *     responses:
 *       201:
 *         description: Deployment created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Deployment created successfully" }
 *                 deployment:
 *                   type: object
 *                   properties:
 *                     deploymentid: { type: string, example: "dep-sX6fg8oMcIXv" }
 *                     name: { type: string, example: "Accra Central School" }
 *                     description: { type: string, example: "Urban Office monitoring station." }
 *                     siteType: { type: string, example: "Urban Office" }
 *                     location: { type: string, example: "{\"latitude\":5.602,\"longitude\":-0.188,\"city\":\"Accra\",\"region\":\"Greater Accra\",\"country\":\"Ghana\"}" }
 *                     nextMaintenanceDate: { type: string, format: date-time, example: "2026-08-20T12:00:00.000Z" }
 *                     imageUrl: { type: string, example: "https://example.com/images/upload.jpg" }
 *       400:
 *         description: Bad request (missing org context or duplicate name).
 *       500:
 *         description: Server error.
 */
router.post('/deployments',
    authenticateToken,
    upload.single('image'),
    requirePermission('devices:write'),
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
 *         schema: { type: string, example: "dep-starter-uuid" }
 *     responses:
 *       200: { description: Deployment details retrieved }
 *       404: { description: Deployment not found }
 */
router.get('/deployments/:deploymentId',
    authenticateToken,
    requirePermission('devices:read'),
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
 *         schema: { type: string, example: "dep-starter-uuid" }
 *     responses:
 *       200: { description: Devices in deployment retrieved }
 */
router.get('/deployments/:deploymentId/devices',
    authenticateToken,
    requirePermission('devices:read'),
    checkOrgAccess('org.deployments.view'),
    deploymentController.listDevicesInDeployment
);

/**
 * @swagger
 * /api/devices/deployments/{deploymentId}:
 *   patch:
 *     tags: [Deployments]
 *     summary: Update deployment details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema: { type: string, example: "dep-starter-uuid" }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Accra Central School"
 *               description:
 *                 type: string
 *                 example: "Updated monitoring station details."
 *               siteType:
 *                 type: string
 *                 example: "Commercial Monitoring"
 *               location:
 *                 type: string
 *                 description: Comma-separated or JSON array coordinates [latitude, longitude]
 *                 example: "5.601, -0.187"
 *               nextMaintenanceDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-08-20T12:00:00Z"
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: New image file to upload for the deployment/site
 *     responses:
 *       200:
 *         description: Deployment updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deployment:
 *                   type: object
 *                   properties:
 *                     deploymentid: { type: string, example: "dep-sX6fg8oMcIXv" }
 *                     name: { type: string, example: "Accra Central School" }
 *                     description: { type: string, example: "Updated description." }
 *                     siteType: { type: string, example: "Commercial Monitoring" }
 *                     location: { type: string, example: "{\"latitude\":6.672,\"longitude\":-1.624,\"city\":\"Kumasi\",\"region\":\"Ashanti\",\"country\":\"Ghana\"}" }
 *                     nextMaintenanceDate: { type: string, format: date-time, example: "2026-08-20T12:00:00.000Z" }
 *                     imageUrl: { type: string, example: "https://example.com/images/upload.jpg" }
 *       404:
 *         description: Deployment not found.
 */
router.patch('/deployments/:deploymentId',
    authenticateToken,
    upload.single('image'),
    requirePermission('devices:write'),
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
 *         schema: { type: string, example: "dep-starter-uuid" }
 *     responses:
 *       200: { description: Deployment deleted }
 *       404: { description: Deployment not found }
 */
router.delete('/deployments/:deploymentId',
    authenticateToken,
    requirePermission('devices:write'),
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
 *               email: { type: string, example: "developer@craftedclimate.com" }
 *               role: { type: string, example: "editor", enum: ['deployment-admin', 'deployment-support', 'deployment-user'] }
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema: { type: string, example: "dep-starter-uuid" }
 *     responses:
 *       201: { description: Collaborator added }
 */
router.post('/deployments/:deploymentId/collaborators',
    authenticateToken,
    requirePermission('devices:write'),
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
 *               email: { type: string, example: "developer@craftedclimate.com" }
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema: { type: string, example: "dep-starter-uuid" }
 *     responses:
 *       200: { description: Collaborator removed }
 */
router.delete('/deployments/:deploymentId/collaborators',
    authenticateToken,
    requirePermission('devices:write'),
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
 *         schema: { type: string, example: "dep-starter-uuid" }
 *     responses:
 *       200: { description: Device added to deployment }
 */
router.post('/deployments/:deploymentId/devices',
    authenticateToken,
    requirePermission('devices:write'),
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
 *         schema: { type: string, example: "dep-starter-uuid" }
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string, example: "GH-ENV-12345XYZ" }
 *     responses:
 *       200: { description: Device removed from deployment }
 */
router.delete('/deployments/:deploymentId/devices/:auid',
    authenticateToken,
    requirePermission('devices:write'),
    checkOrgAccess('org.deployments.edit'),
    deploymentController.removeDeviceFromDeployment
);

/**
 * @swagger
 * /api/devices/deployments:
 *   get:
 *     tags: [Deployments]
 *     summary: List all deployments in the organization
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search query matching name or geocoded location
 *       - in: query
 *         name: siteType
 *         schema: { type: string }
 *         description: Filter by site type category
 *       - in: query
 *         name: region
 *         schema: { type: string }
 *         description: Filter by geographic region subdivision
 *     responses:
 *       200:
 *         description: Deployments list and aggregate summary retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalSites: { type: integer, example: 4 }
 *                     totalDevices: { type: integer, example: 26 }
 *                     averageUptime: { type: string, example: "99.1%" }
 *                     activeAlerts: { type: integer, example: 1 }
 *                 deployments:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       deploymentid: { type: string, example: "dep-StarterUUID" }
 *                       name: { type: string, example: "Accra Central School" }
 *                       description: { type: string, example: "Urban Office monitoring station" }
 *                       siteType: { type: string, example: "Urban Office" }
 *                       location: { type: string, example: "{\"latitude\":5.602,\"longitude\":-0.188,\"city\":\"Accra\",\"region\":\"Greater Accra\",\"country\":\"Ghana\"}" }
 *                       nextMaintenanceDate: { type: string, format: date-time, example: "2026-08-25T12:00:00.000Z" }
 *                       imageUrl: { type: string, example: "https://example.com/image.jpg" }
 *                       devicesCount: { type: integer, example: 8 }
 *                       status: { type: string, example: "Good" }
 *                       uptime: { type: string, example: "100.0%" }
 *                       lastUpdate: { type: string, format: date-time, example: "2026-07-22T23:45:00.000Z" }
 */
router.get('/deployments',
    authenticateToken,
    requirePermission('devices:read'),
    checkOrgAccess('org.deployments.view'),
    deploymentController.listDeployments
);

module.exports = router;
