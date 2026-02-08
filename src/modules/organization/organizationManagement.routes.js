/**
 * Organization Management Routes Extension
 * New routes for name editing, verification, and partner workflows
 * 
 * 🔒 SECURITY: All routes include authentication and authorization
 */

const express = require('express');
const router = express.Router();

// Middleware
const auth = require('../../middleware/auth');
const checkPlatformAdmin = require('../../middleware/organization/checkPlatformAdmin');
const checkOrgNameEditPermission = require('../../middleware/organization/checkOrgNameEditPermission');
const verifyOrgMembership = require('../../middleware/organization/verifyOrgMembership');
// const { csrfProtection } = require('../../middleware/csrfProtection'); // CSRF removed (Bearer Auth is sufficient)
const rateLimitOrgNameEdit = require('../../middleware/organization/rateLimitOrgNameEdit');

// Controller
// Controller
const organizationManagementController = require('./organizationManagement.controller');
const fileUpload = require('../../utils/fileUpload');

// ========================================
// USER ENDPOINTS (Org Members)
// ========================================

/**
 * @swagger
 * /api/org/{orgId}/name:
 *   put:
 *     summary: Update organization name (2x per 30 days limit)
 *     tags: [Organizations (Platform User)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newName
 *               - reason
 *             properties:
 *               newName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *               reason:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Name updated successfully
 *       429:
 *         description: Rate limit exceeded
 *       403:
 *         description: Insufficient permissions
 */
router.put(
    '/:orgId/name',
    auth,
    // csrfProtection,                    // 🔒 CSRF protection (Removed)
    rateLimitOrgNameEdit,              // 🔒 Rate limiting (2x/30 days)
    checkOrgNameEditPermission,
    organizationManagementController.updateOrganizationName
);

/**
 * @swagger
 * /api/org/{orgId}/name-history:
 *   get:
 *     summary: Get organization name edit history
 *     tags: [Organizations (Platform User)]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/:orgId/name-history',
    auth,
    verifyOrgMembership,
    organizationManagementController.getNameEditHistory
);

/**
 * @swagger
 * /api/org/{orgId}/type/request:
 *   post:
 *     summary: Request organization type change
 *     tags: [Organizations (Platform User)]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/:orgId/type/request',
    auth,
    // csrfProtection,                    // 🔒 CSRF protection (Removed)
    verifyOrgMembership,
    organizationManagementController.requestTypeChange
);

/**
 * @swagger
 * /api/org/{orgId}/verify:
 *   post:
 *     summary: Submit business verification
 *     tags: [Organizations (Platform User)]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/:orgId/verify',
    auth,
    // csrfProtection,                    // 🔒 CSRF protection (Removed)
    verifyOrgMembership,
    organizationManagementController.submitVerification
);

/**
 * @swagger
 * /api/org/{orgId}/partner/apply:
 *   post:
 *     summary: Apply for partner status
 *     tags: [Organizations (Platform User)]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/:orgId/partner/apply',
    auth,
    // csrfProtection,                    // 🔒 CSRF protection (Removed)
    verifyOrgMembership,
    organizationManagementController.applyForPartner
);

// ========================================
// ADMIN ENDPOINTS (Platform Admins Only)
// ========================================

/**
 * @swagger
 * /api/org/admin/type-change-requests:
 *   get:
 *     summary: Get all type change requests (admin only)
 *     tags: [Organizations (Platform Admin)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, all]
 */
router.get(
    '/admin/type-change-requests',
    auth,
    checkPlatformAdmin,
    organizationManagementController.getTypeChangeRequests
);

/**
 * @swagger
 * /api/org/admin/type-change-requests/{orgId}/approve:
 *   put:
 *     summary: Approve type change request (admin only)
 *     tags: [Organizations (Platform Admin)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 */
router.put(
    '/admin/type-change-requests/:orgId/approve',
    auth,
    checkPlatformAdmin,
    organizationManagementController.approveTypeChange
);

/**
 * @swagger
 * /api/org/admin/type-change-requests/{orgId}/reject:
 *   put:
 *     summary: Reject type change request (admin only)
 *     tags: [Organizations (Platform Admin)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 */
router.put(
    '/admin/type-change-requests/:orgId/reject',
    auth,
    checkPlatformAdmin,
    organizationManagementController.rejectTypeChange
);

router.get(
    '/admin/verifications',
    auth,
    checkPlatformAdmin,
    organizationManagementController.getVerificationRequests
);

/**
 * @swagger
 * /api/org/admin/verifications/{orgId}/approve:
 *   put:
 *     summary: Approve business verification (admin only)
 *     tags: [Organizations (Platform Admin)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 */
router.put(
    '/admin/verifications/:orgId/approve',
    auth,
    checkPlatformAdmin,
    organizationManagementController.approveVerification
);

/**
 * @swagger
 * /api/org/admin/verifications/{orgId}/reject:
 *   put:
 *     summary: Reject business verification (admin only)
 *     tags: [Organizations (Platform Admin)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 */
router.put(
    '/admin/verifications/:orgId/reject',
    auth,
    checkPlatformAdmin,
    organizationManagementController.rejectVerification
);

/**
 * @swagger
 * /api/org/admin/partners/applications:
 *   get:
 *     summary: Get all partner applications (admin only)
 *     tags: [Organizations (Platform Admin)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, all]
 */
router.get(
    '/admin/partners/applications',
    auth,
    checkPlatformAdmin,
    organizationManagementController.getPartnerApplications
);

/**
 * @swagger
 * /api/org/admin/partners/{orgId}/approve:
 *   put:
 *     summary: Approve partner application (admin only)
 *     tags: [Organizations (Platform Admin)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - approvedTier
 *             properties:
 *               approvedTier:
 *                 type: string
 *                 enum: [silver, gold, platinum]
 */
router.put(
    '/admin/partners/:orgId/approve',
    auth,
    checkPlatformAdmin,
    organizationManagementController.approvePartner
);

/**
 * @swagger
 * /api/org/admin/partners/{orgId}/reject:
 *   put:
 *     summary: Reject partner application (admin only)
 *     tags: [Organizations (Platform Admin)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 */
router.put(
    '/admin/partners/:orgId/reject',
    auth,
    checkPlatformAdmin,
    organizationManagementController.rejectPartner
);

/**
 * @swagger
 * /api/org/admin/partners/{orgId}/revoke:
 *   delete:
 *     summary: Revoke partner status (admin only)
 *     tags: [Organizations (Platform Admin)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 */
router.delete(
    '/admin/partners/:orgId/revoke',
    auth,
    checkPlatformAdmin,
    organizationManagementController.revokePartner
);


/**
 * @swagger
 * /api/org/request-creation:
 *   post:
 *     summary: Request to create a new verified organization
 *     description: Submit details for a new organization. Admin approval required.
 *     tags: [Organizations (Platform User)]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - type
 *               - legalName
 *               - tin
 *               - businessType
 *               - location
 *             properties:
 *               name:
 *                 type: string
 *                 description: Proposed Organization Name
 *               type:
 *                 type: string
 *                 enum: [business, non-profit, government, education, research]
 *               description:
 *                 type: string
 *               
 *               # Business Identity
 *               legalName:
 *                 type: string
 *               tin:
 *                 type: string
 *                 description: Tax Identification Number
 *               businessType:
 *                 type: string
 *                 enum: ["Sole Proprietorship", "Partnership", "Limited Liability Company (LLC)", "Corporation", "Non-Profit"]
 *               industry:
 *                 type: string
 *               website:
 *                 type: string
 *
 *               # Business Location
 *
 *               # Business Location
 *               location:
 *                 type: string
 *                 description: Full business address/location
 *
 *               # Documents (Specific Fields)
 *               business_license:
 *                 type: string
 *                 format: binary
 *               workplace_exterior:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Request submitted successfully
 */
router.post(
    '/request-creation',
    auth,
    fileUpload.any(), // Accept any files (businessCert, workplaceImage, etc.)
    organizationManagementController.requestCreation
);

/**
 * @swagger
 * /api/org/admin/creation-requests:
 *   get:
 *     summary: List organization creation requests (admin only)
 *     tags: [Organizations (Platform Admin)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, all]
 *     responses:
 *       200:
 *         description: List of requests
 *       403:
 *         description: Unauthorized
 */
router.get(
    '/admin/creation-requests',
    auth,
    checkPlatformAdmin,
    organizationManagementController.listCreationRequests
);

/**
 * @swagger
 * /api/org/admin/creation-requests/{requestId}:
 *   get:
 *     summary: Get specific creation request details (admin only)
 *     tags: [Organizations (Platform Admin)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Request details
 *       404:
 *         description: Not found
 */
router.get(
    '/admin/creation-requests/:requestId',
    auth,
    checkPlatformAdmin,
    organizationManagementController.getCreationRequest
);

/**
 * @swagger
 * /api/org/admin/creation-requests/{requestId}/approve:
 *   put:
 *     summary: Approve creation request (Creates Organization)
 *     tags: [Organizations (Platform Admin)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Organization created successfully
 *       404:
 *         description: Request not found
 */
router.put(
    '/admin/creation-requests/:requestId/approve',
    auth,
    checkPlatformAdmin,
    organizationManagementController.approveCreationRequest
);

/**
 * @swagger
 * /api/org/admin/creation-requests/{requestId}/reject:
 *   put:
 *     summary: Reject creation request
 *     tags: [Organizations (Platform Admin)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Request rejected
 *       404:
 *         description: Request not found
 */
router.put(
    '/admin/creation-requests/:requestId/reject',
    auth,
    checkPlatformAdmin,
    organizationManagementController.rejectCreationRequest
);

module.exports = router;
