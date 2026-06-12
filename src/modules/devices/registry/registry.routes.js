const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const registryController = require('./registry.controller');

const authenticateToken = require('../../../middleware/bearermiddleware');
const checkDeviceAccessCompatibility = require('../../../middleware/devices/checkDeviceAccessCompatibility');
const checkOrgAccess = require('../../../middleware/organization/checkOrgAccess');

// Rate limiter for public endpoints
const publicMapLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: { error: 'Too many requests from this IP, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});
const checkFeatureAccess = require('../../../middleware/subscriptions/checkFeatureAccess');

/**
 * @swagger
 * tags:
 *   name: Device Registry
 *   description: User Device Management
 */

/**
 * @swagger
 * /api/devices/public-map:
 *   get:
 *     tags:
 *       - Public
 *     summary: Get all public devices for map display (Rate Limited - 100 req/15min)
 *     parameters:
 *       - in: query
 *         name: model
 *         schema:
 *           type: string
 *           example: "ENV"
 *         description: Filter by sensor model
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           example: "pending"
 *         description: Filter by status (online/offline)
 *       - in: query
 *         name: online
 *         schema:
 *           type: string
 *           example: "online_example"
 *         description: Filter by online status (true/false)
 *     responses:
 *       200:
 *         description: List of public devices with metadata, location, and telemetry
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   metadata:
 *                     type: object
 *                     properties:
 *                       auid:
 *                         type: string
 *                         example: "GH-ENV-12345XYZ"
 *                       nickname:
 *                         type: string
 *                         example: "nickname_example"
 *                       model:
 *                         type: string
 *                         example: "ENV"
 *                       type:
 *                         type: string
 *                         example: "business"
 *                       status:
 *                         type: string
 *                         example: "pending"
 *                       image:
 *                         type: string
 *                         example: "image_example"
 *                       battery:
 *                         type: number
 *                         example: 1
 *                       lastSeen:
 *                         type: string
 *                         example: "metadata_example"
 *                   location:
 *                     type: object
 *                     properties:
 *                       latitude:
 *                         type: number
 *                         example: 1
 *                       longitude:
 *                         type: number
 *                         example: 1
 *                   telemetry:
 *                     type: object
 *       429:
 *         description: Too many requests
 */
router.get('/public-map', publicMapLimiter, registryController.getPublicDevices);

/**
 * @swagger
 * /api/devices/public-map/models:
 *   get:
 *     tags:
 *       - Public
 *     summary: Get list of available sensor models in public devices
 *     responses:
 *       200:
 *         description: List of sensor models
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 models:
 *                   type: array
 *                   items:
 *                     type: string
 *                     example: "properties_example"
 */
router.get('/public-map/models', publicMapLimiter, registryController.getPublicSensorModels);

/**
 * @swagger
 * /api/devices/permissions/catalog:
 *   get:
 *     tags: [Device Registry]
 *     summary: Get permissions catalog for device collaborator assignment
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of roles and assignable permissions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 roles:
 *                   type: array
 *                   items:
 *                     type: object
 *                 assignablePermissions:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/permissions/catalog',
    authenticateToken,
    registryController.getPermissionsCatalog
);

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
 *               auid: { type: string, example: "GH-ENV-12345XYZ" }
 *               serial: { type: string, example: "SN-987654321" }
 *               location: { type: array, items: { type: number }, example: [5.56, -0.20] }
 *               nickname: { type: string, example: "nickname_example" }
 *               frequency: { type: integer, example: 1, default: 30, description: "Expected reporting interval in minutes" }
 *               batch: { type: integer, example: 1, default: 2, description: "Telemetry batch size" }
 *     responses:
 *       201:
 *         description: Device registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Device'
 *       400:
 *         description: Missing required fields or invalid data
 *       403:
 *         description: Organization device limit reached or insufficient permissions
 *       404:
 *         description: Device not found in manufacturer records
 *       409:
 *         description: Device already registered
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
 *     security:
 *       - bearerAuth: []
 *       - organizationId: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema: { type: string, example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }
 *       - in: query
 *         name: orgId
 *         required: false
 *         schema: { type: string, example: "org-starter-uuid" }
 *         description: Optional organization ID to filter devices by workspace
 *     responses:
 *       200: { description: List of registered devices }
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
 *     security:
 *       - bearerAuth: []
 *       - organizationId: []
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string, example: "GH-ENV-12345XYZ" }
 *     responses:
 *       200: { description: Device found }
 *       404: { description: Device not found }
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
 *     security:
 *       - bearerAuth: []
 *       - organizationId: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema: { type: string, example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string, example: "GH-ENV-12345XYZ" }
 *     responses:
 *       200: { description: Device deleted }
 *       404: { description: Device not found }
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
 *     security:
 *       - bearerAuth: []
 *       - organizationId: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema: { type: string, example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }
 *     responses:
 *       200: { description: Device locations retrieved }
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
 *     security:
 *       - bearerAuth: []
 *       - organizationId: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema: { type: string, example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string, example: "GH-ENV-12345XYZ" }
 *     responses:
 *       200: { description: specific device location }
 *       404: { description: Location not found }
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
 *     summary: Update a device's settings (nickname, location, frequency, batch)
 *     security:
 *       - bearerAuth: []
 *       - organizationId: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema: { type: string, example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }
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
 *             properties:
 *               nickname: { type: string, example: "nickname_example" }
 *               location: { type: array, items: { type: number }, example: [5.56, -0.20] }
 *               frequency: { type: integer, example: 1, description: "Expected reporting interval in minutes" }
 *               batch: { type: integer, example: 1, description: "Telemetry batch size" }
 *               notificationPreferences:
 *                 type: object
 *                 properties:
 *                   enabled: { type: boolean, example: true }
 *                   offlineAlert: { type: boolean, example: true }
 *                   alertThresholdMinutes: { type: number, example: 1 }
 *                   recipients: { type: array, example: ["example_value"], items: { type: string } }
 *     responses:
 *       200: { description: Device updated }
 *       404: { description: Device not found }
 */
router.put('/user/:userid/device/:auid/update',
    authenticateToken,
    checkFeatureAccess("device_update"),
    registryController.updateDevice
);

/**
 * @swagger
 * /api/devices/device/{auid}/transfer:
 *   post:
 *     tags: [Device Registry]
 *     summary: Transfer device to another organization
 *     security:
 *       - bearerAuth: []
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
 *             required: [targetOrgId]
 *             properties:
 *               targetOrgId: { type: string, example: "org-starter-uuid" }
 *               targetDeploymentId: { type: string, example: "dep-starter-uuid" }
 *     responses:
 *       200: { description: Device transferred }
 *       404: { description: Device or Organization not found }
 */
router.post('/device/:auid/transfer',
    authenticateToken,
    registryController.transferDevice
);

/**
 * @swagger
 * /api/devices/{userid}/device/{auid}/collaborators:
 *   post:
 *     tags: [Device Registry]
 *     summary: Add a collaborator to a device
 *     security:
 *       - bearerAuth: []
 *       - organizationId: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema: { type: string, example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }
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
 *             required: [email, role]
 *             properties:
 *               email:
 *                 type: string
 *                 example: "developer@craftedclimate.com"
 *                 format: email
 *               role:
 *                 type: string
 *                 example: "editor"
 *                 enum: ['device-admin', 'device-support', 'device-user', 'viewer', 'editor', 'admin', 'support', 'user']
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                   example: "properties_example"
 *     responses:
 *       201: { description: Collaborator added }
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
 *         schema: { type: string, example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string, example: "GH-ENV-12345XYZ" }
 *     responses:
 *       200: { description: Collaborator removed }
 */
router.delete('/:userid/device/:auid/collaborators',
    authenticateToken,
    registryController.removeCollaborator
);

/**
 * @swagger
 * /api/devices/{userid}/device/{auid}/collaborators:
 *   get:
 *     tags: [Device Registry]
 *     summary: List all collaborators of a device
 *     security:
 *       - bearerAuth: []
 *       - organizationId: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema: { type: string, example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string, example: "GH-ENV-12345XYZ" }
 *     responses:
 *       200:
 *         description: List of collaborators with user details
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   userid: { type: string, example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }
 *                   role: { type: string, example: "editor" }
 *                   permissions: { type: array, example: ["org.devices.view", "org.telemetry.read"], items: { type: string } }
 *                   addedAt: { type: string, example: "2026-06-12T11:29:56Z", format: date-time }
 *                   user:
 *                     type: object
 *                     properties:
 *                       firstName: { type: string, example: "Arnold" }
 *                       lastName: { type: string, example: "Sylvian" }
 *                       username: { type: string, example: "arnold_sylvian" }
 *                       email: { type: string, example: "developer@craftedclimate.com" }
 *                       profilePicture: { type: string, example: "profilePicture_example" }
 */
router.get('/:userid/device/:auid/collaborators',
    authenticateToken,
    registryController.listCollaborators
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
 *         schema: { type: string, example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }
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
 *             required: [email]
 *             properties:
 *               email: { type: string, example: "developer@craftedclimate.com" }
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
 *     security:
 *       - bearerAuth: []
 *       - organizationId: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema: { type: string, example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }
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
 *             required: [availability]
 *             properties:
 *               availability:
 *                 type: string
 *                 example: "properties_example"
 *                 enum: ['public', 'private']
 *                 description: Device accessibility
 *     responses:
 *       200: { description: Availability updated }
 */
router.put('/user/:userid/device/:auid/availability',
    authenticateToken,
    checkFeatureAccess("public_listing"),
    registryController.setAvailability
);

// ── STATE (On / Off) ──────────────────────────────────────────────────────────

const stateChangeLimiter = rateLimit({
    windowMs: 60 * 1000,   // 1 minute
    max: 10,               // Max 10 state changes per minute (prevents abuse)
    message: { error: 'Too many state change requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * @swagger
 * /api/devices/device/{auid}/state:
 *   put:
 *     tags:
 *       - Device Registry
 *     summary: Set device operational state (active / inactive / disabled)
 *     description: |
 *       Intentionally turns a device ON or OFF. This is distinct from the
 *       connectivity `status` (online/offline). When set to `inactive` or
 *       `disabled`, offline alerts are suppressed and the heartbeat is removed
 *       so the system does not flag it as a lost device.
 *
 *       **Permissions required:** Device owner OR org/deployment member with
 *       `control` permission.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string, example: "GH-ENV-12345XYZ" }
 *         description: Device AUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [state]
 *             properties:
 *               state:
 *                 type: string
 *                 example: "properties_example"
 *                 enum: ['active', 'inactive', 'disabled']
 *                 description: |
 *                   - `active`   - Device is operational and should report data.
 *                   - `inactive` - Deliberately turned off. Alerts suppressed.
 *                   - `disabled` - Permanently deactivated (usually auto-set after 30+ days inactive).
 *     responses:
 *       200:
 *         description: Device state updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:    { type: string, example: "This is a status update notification." }
 *                 auid:       { type: string, example: "GH-ENV-12345XYZ" }
 *                 state:      { type: string, example: "state_example", enum: ['active', 'inactive', 'disabled'] }
 *                 stateChangedAt: { type: string, example: "2026-06-12T11:29:56Z", format: date-time }
 *                 stateChangedBy: { type: string, example: "stateChangedBy_example" }
 *       400: { description: Invalid state value }
 *       403: { description: Forbidden - insufficient permissions }
 *       404: { description: Device not found }
 */
router.put('/device/:auid/state',
    authenticateToken,
    stateChangeLimiter,
    registryController.setDeviceState
);

module.exports = router;
