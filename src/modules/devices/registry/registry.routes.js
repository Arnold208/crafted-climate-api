const express = require('express');
const router = express.Router();
const registryController = require('./registry.controller');

const authenticateToken = require('../../../middleware/bearermiddleware');
const checkOrgAccess = require('../../../middleware/organization/checkOrgAccess');
const checkFeatureAccess = require('../../../middleware/subscriptions/checkFeatureAccess');

/**
 * @swagger
 * tags:
 *   name: Device Registry
 *   description: User Device Management
 */

/**
 * @swagger
 * /api/devices/register-device:
 *   post:
 *     tags: [Device Registry]
 *     summary: Register a new device
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [auid, serial, location, nickname]
 *             properties:
 *               auid: { type: string }
 *               serial: { type: string }
 *               location: { type: array, items: { type: number }, example: [5.56, -0.20] }
 *               nickname: { type: string }
 */
router.post('/register-device',
    authenticateToken,
    checkOrgAccess("org.devices.add"),
    registryController.registerDevice
);

/**
 * @swagger
 * /api/devices/user/{userid}/registered-devices:
 *   get:
 *     tags: [Device Registry]
 *     summary: Get all registered devices for a user
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema: { type: string }
 */
router.get('/user/:userid/registered-devices',
    authenticateToken,
    registryController.getUserDevices
);

/**
 * @swagger
 * /api/devices/find-registered-device/{auid}:
 *   get:
 *     tags: [Device Registry]
 *     summary: Find a registered device by AUID
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 */
router.get('/find-registered-device/:auid',
    authenticateToken,
    registryController.getDeviceByAuid
);

/**
 * @swagger
 * /api/devices/delete-device/{userid}/{auid}:
 *   delete:
 *     tags: [Device Registry]
 *     summary: Delete a device
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 */
router.delete('/delete-device/:userid/:auid',
    authenticateToken,
    registryController.deleteDevice
);

/**
 * @swagger
 * /api/devices/user/{userid}/device-locations:
 *   get:
 *     tags: [Device Registry]
 *     summary: Get all device locations for a user
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema: { type: string }
 */
router.get('/user/:userid/device-locations',
    authenticateToken,
    registryController.getLocation
);

/**
 * @swagger
 * /api/devices/user/{userid}/device/{auid}/location:
 *   get:
 *     tags: [Device Registry]
 *     summary: Get a specific device location
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 */
router.get('/user/:userid/device/:auid/location',
    authenticateToken,
    checkFeatureAccess("location_access"),
    registryController.getSpecificLocation
);

/**
 * @swagger
 * /api/devices/user/{userid}/device/{auid}/update:
 *   put:
 *     tags: [Device Registry]
 *     summary: Update a device's nickname or location
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 */
router.put('/user/:userid/device/:auid/update',
    authenticateToken,
    checkFeatureAccess("device_update"),
    registryController.updateDevice
);

/**
 * @swagger
 * /api/devices/{userid}/device/{auid}/collaborators:
 *   post:
 *     tags: [Device Registry]
 *     summary: Add a collaborator to a device
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 */
router.post('/:userid/device/:auid/collaborators',
    authenticateToken,
    checkFeatureAccess("collaboration"),
    registryController.addCollaborator
);

/**
 * @swagger
 * /api/devices/{userid}/device/{auid}/collaborators:
 *   delete:
 *     tags: [Device Registry]
 *     summary: Remove a collaborator from a device
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 */
router.delete('/:userid/device/:auid/collaborators',
    authenticateToken,
    registryController.removeCollaborator
);

/**
 * @swagger
 * /api/devices/{userid}/device/{auid}/collaborators/permissions:
 *   post:
 *     tags: [Device Registry]
 *     summary: Get role and permissions of a user on a device
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string }
 *     responses:
 *       200:
 *         description: Role and permissions returned
 *       404:
 *         description: Device found
 */
router.post('/:userid/device/:auid/collaborators/permissions',
    authenticateToken,
    registryController.getCollaboratorPermissions
);

/**
 * @swagger
 * /api/devices/user/{userid}/device/{auid}/availability:
 *   put:
 *     tags: [Device Registry]
 *     summary: Set a device's availability (public/private)
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 */
router.put('/user/:userid/device/:auid/availability',
    authenticateToken,
    checkFeatureAccess("public_listing"),
    registryController.setAvailability
);

module.exports = router;
