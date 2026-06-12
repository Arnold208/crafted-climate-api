const express = require('express');
const router = express.Router();
const organizationController = require('./organization.controller');
const orgDevicesController = require('./organization.devices.controller');

// Middleware
const authenticateToken = require('../../middleware/bearermiddleware');
const checkOrgAccess = require('../../middleware/organization/checkOrgAccess');
const authorizeRoles = require('../../middleware/rbacMiddleware');
const checkPlanFeature = require('../../middleware/subscriptions/checkPlanFeature');

/**
 * @swagger
 * tags:
 *   name: Organizations
 *   description: Manage organizations, collaborators, and RBAC roles
 */

/**
 * @swagger
 * /api/org/create:
 *   post:
 *     summary: Create a new organization (Admin only)
 *     tags: [Organizations (Platform User)]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - ownerUserId
 *             properties:
 *               name:
 *                 type: string
 *                 description: Organization name (must be unique)
 *                 example: "GreenTech Solutions"
 *               description:
 *                 type: string
 *                 description: Organization description
 *                 example: "Climate monitoring solutions provider"
 *               ownerUserId:
 *                 type: string
 *                 description: User ID of the organization owner
 *                 example: "user-123-abc"
 *               planName:
 *                 type: string
 *                 description: Subscription plan name
 *                 example: "enterprise"
 *               organizationType:
 *                 type: string
 *                 enum: [personal, business, non-profit, government, education, research]
 *                 description: Type of organization (defaults to 'personal' if not provided)
 *                 example: "business"
 *     responses:
 *       201:
 *         description: Organization created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Organization created successfully"
 *                 organizationId:
 *                   type: string
 *                   example: "org-123-abc-def"
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized - Admin access required
 *       409:
 *         description: Organization name already exists
 */
// Create Organization (Admin)
router.post('/create', authenticateToken, authorizeRoles('admin'), organizationController.create);


/**
 * @swagger
 * /api/org/my-organizations:
 *   get:
 *     summary: Get list of organizations I belong to
 *     tags: [Organizations (Platform User)]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of organizations
 */
router.get('/my-organizations', authenticateToken, organizationController.getMyOrganizations);

/**
 * @swagger
 * /api/org/select:
 *   post:
 *     summary: Switch active organization context
 *     tags: [Organizations (Platform User)]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [organizationId]
 *             properties:
 *               organizationId: { type: string, example: "org-starter-uuid" }
 *     responses:
 *       200:
 *         description: Context switched successfully
 */
router.post('/select', authenticateToken, organizationController.selectOrganization);
// Support legacy PATCH /select as well since it was in old routes
router.patch('/select', authenticateToken, organizationController.selectOrganization);

/**
 * @swagger
 * /api/org/{orgId}/info:
 *   get:
 *     summary: Get organization details (metadata)
 *     tags: [Organizations (Platform User)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string, example: "org-starter-uuid" }
 *     responses:
 *       200:
 *         description: Organization info retrieved
 */
router.get('/:orgId/info', authenticateToken, organizationController.getOrganizationInfo);

/**
 * @swagger
 * /api/org/{orgId}/dashboard:
 *   get:
 *     summary: Get organization dashboard stats
 *     tags: [Organizations (Platform User)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string, example: "org-starter-uuid" }
 *     responses:
 *       200:
 *         description: Stats retrieved
 */
router.get('/:orgId/dashboard',
    authenticateToken,
    checkOrgAccess('org.devices.view'), // Assuming view access is enough for dashboard
    organizationController.getDashboard
);

/**
 * @swagger
 * /api/org/{orgId}/invite:
 *   post:
 *     summary: Invite a member to the organization
 *     tags: [Organizations (Platform User)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string, example: "org-starter-uuid" }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, role]
 *             properties:
 *               email: { type: string, example: "developer@craftedclimate.com", format: email }
 *               role: { type: string, example: "editor", enum: ['org-admin', 'org-support', 'org-user', 'viewer', 'editor', 'admin', 'support', 'user'] }
 *     responses:
 *       200:
 *         description: User invited successfully
 */
router.post('/:orgId/invite',
    authenticateToken,
    checkOrgAccess("org.users.invite"),
    checkPlanFeature('collaboration'),
    organizationController.addCollaborator
);

// Legacy path support
router.post('/:orgId/add-user',
    authenticateToken,
    checkOrgAccess("org.users.invite"),
    checkPlanFeature('collaboration'),
    organizationController.addCollaborator
);

/**
 * @swagger
 * /api/org/{orgId}/update-role:
 *   patch:
 *     summary: Update a member's role
 *     tags: [Organizations (Platform User)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string, example: "org-starter-uuid" }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, newRole]
 *             properties:
 *               userid: { type: string, example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }
 *               newRole: { type: string, example: "newRole_example", enum: ['org-admin', 'org-support', 'org-user', 'viewer', 'editor', 'admin', 'support', 'user'] }
 *     responses:
 *       200:
 *         description: Role updated successfully
 */
router.patch('/:orgId/update-role',
    authenticateToken,
    checkOrgAccess("org.users.change-role"),
    organizationController.updateCollaboratorRole
);
router.patch('/:orgId/update-user-role',
    authenticateToken,
    checkOrgAccess("org.users.change-role"),
    organizationController.updateCollaboratorRole
);

/**
 * @swagger
 * /api/org/{orgId}/members:
 *   get:
 *     summary: List all organization members
 *     tags: [Organizations (Platform User)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string, example: "org-starter-uuid" }
 *     responses:
 *       200:
 *         description: List of members with user details
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   userid: { type: string, example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }
 *                   role: { type: string, example: "editor" }
 *                   user:
 *                     type: object
 *                     properties:
 *                       firstName: { type: string, example: "Arnold" }
 *                       lastName: { type: string, example: "Sylvian" }
 *                       username: { type: string, example: "arnold_sylvian" }
 *                       email: { type: string, example: "developer@craftedclimate.com" }
 *                       profilePicture: { type: string, example: "profilePicture_example" }
 */
router.get('/:orgId/members',
    authenticateToken,
    checkOrgAccess("org.users.view"), // Assuming this permission exists or reuse org.read
    organizationController.getMembers
);

/**
 * @swagger
 * /api/org/{orgId}/remove-user:
 *   post:
 *     summary: Remove a member from the organization (using Email)
 *     tags: [Organizations (Platform User)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string, example: "org-starter-uuid" }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, example: "developer@craftedclimate.com", format: email }
 *     responses:
 *       200:
 *         description: User removed successfully
 */
router.post('/:orgId/remove-user',
    authenticateToken,
    checkOrgAccess("org.users.remove"),
    organizationController.removeCollaborator
);

/**
 * @swagger
 * /api/org/{orgId}/remove-user/{userid}:
 *   delete:
 *     summary: Remove a member from the organization (Legacy)
 *     tags: [Organizations (Platform User)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string, example: "org-starter-uuid" }
 *       - in: path
 *         name: userid
 *         required: true
 *         schema: { type: string, example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }
 *     responses:
 *       200:
 *         description: User removed successfully
 */
router.delete('/:orgId/remove-user/:userid',
    authenticateToken,
    checkOrgAccess("org.users.remove"),
    organizationController.removeCollaborator
);

/**
 * @swagger
 * /api/org/{orgId}:
 *   delete:
 *     summary: Dissolve (delete) an organization
 *     tags: [Organizations (Platform User)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string, example: "org-starter-uuid" }
 *     responses:
 *       200:
 *         description: Organization dissolved successfully
 *       403:
 *         description: Unauthorized (Org Admin only)
 */
router.delete('/:orgId',
    authenticateToken,
    // We rely on service-level check for 'org-admin' role for critical actions
    // But we can also add a permission check if 'org.delete' existed.
    // tailored Logic:
    organizationController.dissolve
);


// --- Device Management (Org Scoped) ---

/**
 * @swagger
 * /api/org/{orgId}/devices:
 *   get:
 *     summary: List devices in organization
 *     tags: [Organization Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string, example: "org-starter-uuid" }
 *     responses:
 *       200: { description: List of devices }
 */
router.get('/:orgId/devices',
    authenticateToken,
    checkOrgAccess('org.devices.view'),
    orgDevicesController.listDevices
);

/**
 * @swagger
 * /api/org/{orgId}/devices/{auid}:
 *   get:
 *     summary: Get device details
 *     tags: [Organization Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string, example: "org-starter-uuid" }
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string, example: "GH-ENV-12345XYZ" }
 *     responses:
 *       200: { description: Device details }
 *       404: { description: Device not found }
 */
router.get('/:orgId/devices/:auid',
    authenticateToken,
    checkOrgAccess('org.devices.view'),
    orgDevicesController.getDevice
);

/**
 * @swagger
 * /api/org/{orgId}/devices/{auid}:
 *   put:
 *     summary: Update device details
 *     tags: [Organization Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string, example: "org-starter-uuid" }
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
 *               name: { type: string, example: "Afrilogic Environmental Solutions" }
 *     responses:
 *       200: { description: Device updated }
 */
router.put('/:orgId/devices/:auid',
    authenticateToken,
    checkOrgAccess('org.devices.edit'),
    orgDevicesController.updateDevice
);

/**
 * @swagger
 * /api/org/{orgId}/devices/{auid}:
 *   delete:
 *     summary: Delete device from organization
 *     tags: [Organization Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string, example: "org-starter-uuid" }
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string, example: "GH-ENV-12345XYZ" }
 *     responses:
 *       200: { description: Device deleted }
 */
router.delete('/:orgId/devices/:auid',
    authenticateToken,
    checkOrgAccess('org.devices.remove'),
    orgDevicesController.deleteDevice
);

/**
 * @swagger
 * /api/org/{orgId}/devices/{auid}/remove:
 *   delete:
 *     summary: Remove device from organization (unbind)
 *     tags: [Organization Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string, example: "org-starter-uuid" }
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string, example: "GH-ENV-12345XYZ" }
 *     responses:
 *       200: { description: Device removed }
 */
router.delete('/:orgId/devices/:auid/remove',
    authenticateToken,
    checkOrgAccess('org.devices.remove'),
    orgDevicesController.removeDevice
);

/**
 * @swagger
 * /api/org/{orgId}/devices/{auid}/move:
 *   post:
 *     summary: Move device to another deployment
 *     description: |
 *       Moves a device between deployments **within the same organization**.
 *       - Preserves all organization-level collaborators.
 *       - Updates the project site/deployment association.
 *     tags: [Organization Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string, example: "org-starter-uuid" }
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
 *             required: [deploymentId]
 *             properties:
 *               deploymentId: { type: string, example: "dep-starter-uuid" }
 *     responses:
 *       200: { description: Device moved }
 */
router.post('/:orgId/devices/:auid/move',
    authenticateToken,
    checkOrgAccess('org.deployments.edit'),
    orgDevicesController.moveDevice
);

/**
 * @swagger
 * /api/org/{orgId}/devices/{auid}/transfer:
 *   post:
 *     summary: Transfer device to another organization
 *     description: |
 *       Transfers ownership of a device to a **different organization**.
 *       - **Resets Deployment**: Device is detached from its current site.
 *       - **Wipes Collaborators**: All previous collaborators are removed for privacy.
 *       - **New Admin**: The user performing the transfer becomes the sole admin in the target org.
 *     tags: [Organization Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string, example: "org-starter-uuid" }
 *         description: Source Organization ID
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
 *     responses:
 *       200: { description: Device transferred }
 *       403: { description: User not member of target org }
 */
router.post('/:orgId/devices/:auid/transfer',
    authenticateToken,
    checkOrgAccess('org.devices.edit'),
    orgDevicesController.transferDevice
);

/**
 * @swagger
 * /api/org/devices/transfer-batch:
 *   post:
 *     summary: Batch transfer multiple devices to a target organization
 *     tags: [Organizations (Platform User)]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [auids, targetOrgId]
 *             properties:
 *               auids:
 *                 type: array
 *                 items:
 *                   type: string
 *                   example: "auids_example"
 *               targetOrgId:
 *                 type: string
 *                 example: "properties_example"
 *     responses:
 *       200:
 *         description: Batch transfer completed
 */
router.post('/devices/transfer-batch',
    authenticateToken,
    orgDevicesController.transferDevicesBatch
);

// ========================================
// 🆕 ORGANIZATION MANAGEMENT ROUTES
// Name editing, verification, partner workflows
// ========================================
const organizationManagementRoutes = require('./organizationManagement.routes');
router.use('/', organizationManagementRoutes);

// ========================================
// 🔑 API KEY MANAGEMENT ROUTES
// Generate, rotate, revoke API keys
// ========================================
const orgApiKeyRoutes = require('./orgApiKey.routes');
router.use('/:orgId/api-keys', orgApiKeyRoutes);

// ========================================
// ✉️ INVITATION ROUTES
// Invite members, accept/decline invites
// ========================================
const invitationRoutes = require('./invitation.routes');
router.use('/', invitationRoutes);

module.exports = router;
