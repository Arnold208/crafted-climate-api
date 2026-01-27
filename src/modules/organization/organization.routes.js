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
 *     tags: [Organizations]
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

// Get My Organizations
router.get('/my-organizations', authenticateToken, organizationController.getMyOrganizations);

// Switch Active Organization
router.post('/select', authenticateToken, organizationController.selectOrganization);
// Support legacy PATCH /select as well since it was in old routes
router.patch('/select', authenticateToken, organizationController.selectOrganization);

// Get Organization Info
router.get('/:orgId/info', authenticateToken, organizationController.getOrganizationInfo);

// Get Organization Dashboard (Analytics)
router.get('/:orgId/dashboard',
    authenticateToken,
    checkOrgAccess('org.devices.view'), // Assuming view access is enough for dashboard
    organizationController.getDashboard
);

// Add Collaborator
router.post('/:orgId/invite',
    authenticateToken,
    checkOrgAccess("org.users.invite"),
    checkPlanFeature('collaboration'),
    organizationController.addCollaborator
);
// Legacy path support if needed (old route was /:orgId/add-user or /:orgId/invite depending on section)
// The file showed multiple routes. I will support /:orgId/add-user too to be safe.
router.post('/:orgId/add-user',
    authenticateToken,
    checkOrgAccess("org.users.invite"),
    checkPlanFeature('collaboration'),
    organizationController.addCollaborator
);

// Update Role
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

// Remove User
router.delete('/:orgId/remove-user/:userid',
    authenticateToken,
    checkOrgAccess("org.users.remove"),
    organizationController.removeCollaborator
);


// --- Device Management (Org Scoped) ---

router.get('/:orgId/devices',
    authenticateToken,
    checkOrgAccess('org.devices.view'),
    orgDevicesController.listDevices
);

router.get('/:orgId/devices/:auid',
    authenticateToken,
    checkOrgAccess('org.devices.view'),
    orgDevicesController.getDevice
);

router.put('/:orgId/devices/:auid',
    authenticateToken,
    checkOrgAccess('org.devices.edit'),
    orgDevicesController.updateDevice
);

router.delete('/:orgId/devices/:auid',
    authenticateToken,
    checkOrgAccess('org.devices.remove'),
    orgDevicesController.deleteDevice
);

router.delete('/:orgId/devices/:auid/remove',
    authenticateToken,
    checkOrgAccess('org.devices.remove'),
    orgDevicesController.removeDevice
);

router.post('/:orgId/devices/:auid/move',
    authenticateToken,
    checkOrgAccess('org.deployments.edit'),
    orgDevicesController.moveDevice
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

module.exports = router;
