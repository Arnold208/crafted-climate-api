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
const { csrfProtection } = require('../../middleware/csrfProtection');
const rateLimitOrgNameEdit = require('../../middleware/organization/rateLimitOrgNameEdit');

// Controller
const organizationManagementController = require('./organizationManagement.controller');

// ========================================
// USER ENDPOINTS (Org Members)
// ========================================

/**
 * @swagger
 * /api/org/{orgId}/name:
 *   put:
 *     summary: Update organization name (2x per 30 days limit)
 *     tags: [Organization Management]
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
    csrfProtection,                    // 🔒 CSRF protection
    rateLimitOrgNameEdit,              // 🔒 Rate limiting (2x/30 days)
    checkOrgNameEditPermission,
    organizationManagementController.updateOrganizationName
);

/**
 * @swagger
 * /api/org/{orgId}/name-history:
 *   get:
 *     summary: Get organization name edit history
 *     tags: [Organization Management]
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
 *     tags: [Organization Management]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/:orgId/type/request',
    auth,
    csrfProtection,                    // 🔒 CSRF protection
    verifyOrgMembership,
    organizationManagementController.requestTypeChange
);

/**
 * @swagger
 * /api/org/{orgId}/verify:
 *   post:
 *     summary: Submit business verification
 *     tags: [Organization Management]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/:orgId/verify',
    auth,
    csrfProtection,                    // 🔒 CSRF protection
    verifyOrgMembership,
    organizationManagementController.submitVerification
);

/**
 * @swagger
 * /api/org/{orgId}/partner/apply:
 *   post:
 *     summary: Apply for partner status
 *     tags: [Organization Management]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/:orgId/partner/apply',
    auth,
    csrfProtection,                    // 🔒 CSRF protection
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
 *     tags: [Admin - Organization Management]
 *     security:
 *       - bearerAuth: []
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
 *     tags: [Admin - Organization Management]
 *     security:
 *       - bearerAuth: []
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
 *     tags: [Admin - Organization Management]
 *     security:
 *       - bearerAuth: []
 */
router.put(
    '/admin/type-change-requests/:orgId/reject',
    auth,
    checkPlatformAdmin,
    organizationManagementController.rejectTypeChange
);

/**
 * @swagger
 * /api/org/admin/verifications:
 *   get:
 *     summary: Get all verification requests (admin only)
 *     tags: [Admin - Organization Management]
 *     security:
 *       - bearerAuth: []
 */
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
 *     tags: [Admin - Organization Management]
 *     security:
 *       - bearerAuth: []
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
 *     tags: [Admin - Organization Management]
 *     security:
 *       - bearerAuth: []
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
 *     tags: [Admin - Organization Management]
 *     security:
 *       - bearerAuth: []
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
 *     tags: [Admin - Organization Management]
 *     security:
 *       - bearerAuth: []
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
 *     tags: [Admin - Organization Management]
 *     security:
 *       - bearerAuth: []
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
 *     tags: [Admin - Organization Management]
 *     security:
 *       - bearerAuth: []
 */
router.delete(
    '/admin/partners/:orgId/revoke',
    auth,
    checkPlatformAdmin,
    organizationManagementController.revokePartner
);

module.exports = router;
