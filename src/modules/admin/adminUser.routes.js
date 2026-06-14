const express = require('express');
const router = express.Router();
const adminUserController = require('./adminUser.controller');
const authenticateToken = require('../../middleware/bearermiddleware');
const authorizeRoles = require('../../middleware/rbacMiddleware');


/**
 * @swagger
 * tags:
 *   - name: Authentication
 *     description: Backoffice admin authentication — MFA login, OTP verification, and password reset
 */

/**
 * @swagger
 * /api/auth/backoffice/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Initiate Backoffice Admin Login (MFA Step 1)
 *     description: Authenticate administrative credentials (admin/supervisor/support) and trigger SMS OTP.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: "admin@example.com"
 *                 format: email
 *               password:
 *                 type: string
 *                 example: "Password123!"
 *                 format: password
 *     responses:
 *       200:
 *         description: Login credentials verified, OTP sent via SMS
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Unauthorized role
 */

/**
 * @swagger
 * /api/auth/backoffice/verify-otp:
 *   post:
 *     tags: [Authentication]
 *     summary: Verify Backoffice OTP (MFA Step 2)
 *     description: Verify the SMS OTP code and generate final JWT tokens.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tempSessionId
 *               - otp
 *             properties:
 *               tempSessionId:
 *                 type: string
 *                 example: "a1b2c3d4e5f6..."
 *                 description: The temporary session reference returned by the login step
 *               otp:
 *                 type: string
 *                 example: "123456"
 *                 description: 6-digit SMS OTP code
 *     responses:
 *       200:
 *         description: Authentication successful, tokens generated
 *       400:
 *         description: Invalid OTP or session expired
 */

/**
 * @swagger
 * /api/auth/backoffice/forgot-password:
 *   post:
 *     tags: [Authentication]
 *     summary: Initiate Backoffice Admin Password Reset Request
 *     description: Submits a password reset request which requires peer-approval by another Platform Administrator.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: "admin@example.com"
 *                 format: email
 *     responses:
 *       200:
 *         description: Reset request successfully submitted for approval
 *       403:
 *         description: Restrictive roles only
 *       404:
 *         description: User not found
 */

/**
 * @swagger
 * /api/auth/backoffice/reset-password:
 *   post:
 *     tags: [Authentication]
 *     summary: Complete Backoffice Admin Password Reset
 *     description: Reset backoffice user's password using the single-use token from the approved request.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - requestId
 *               - token
 *               - newPassword
 *             properties:
 *               requestId:
 *                 type: string
 *                 example: "req-pwd-12345"
 *                 description: The password reset request ID
 *               token:
 *                 type: string
 *                 example: "token-uuid-12345"
 *                 description: The reset token sent via email
 *               newPassword:
 *                 type: string
 *                 example: "NewPassword123!"
 *                 format: password
 *                 description: The new password to set
 *     responses:
 *       200:
 *         description: Password updated successfully
 *       400:
 *         description: Invalid parameters, request not approved, expired or incorrect token
 *       404:
 *         description: Reset request or target user not found
 */

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     tags: [Authentication]
 *     summary: List all users
 *     description: Get paginated list of users with optional filters (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by email, username, or name
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [user, admin, supervisor, support]
 *       - in: query
 *         name: verified
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: string
 *           enum: [only, include]
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *       403:
 *         description: Forbidden - Platform admin, supervisor, or support required
 */
router.get('/', authenticateToken, authorizeRoles('admin', 'supervisor', 'support'), adminUserController.listUsers);

/**
 * @swagger
 * /api/admin/users/password-reset-requests:
 *   get:
 *     tags: [Authentication]
 *     summary: List platform admin password reset requests
 *     description: Retrieve list of password reset requests for platform admin/supervisor/support roles (Platform Admin/Supervisor only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, completed]
 *         description: Filter requests by status
 *     responses:
 *       200:
 *         description: List of password reset requests retrieved successfully
 *       403:
 *         description: Forbidden - Platform admin or supervisor required
 */
router.get('/password-reset-requests', authenticateToken, authorizeRoles('admin', 'supervisor'), adminUserController.listPasswordResetRequests);

/**
 * @swagger
 * /api/admin/users/password-reset-requests/{requestId}/approve:
 *   post:
 *     tags: [Authentication]
 *     summary: Approve administrative password reset request
 *     description: Approve password reset for backoffice roles, generating a secure single-use token sent via Email link (Platform Admin only)
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
 *         description: Request approved, single-use token generated and reset link sent via email
 *       400:
 *         description: Request not found or not in pending status
 *       403:
 *         description: Forbidden - Platform admin required
 */
router.post('/password-reset-requests/:requestId/approve', authenticateToken, authorizeRoles('admin'), adminUserController.approvePasswordResetRequest);

/**
 * @swagger
 * /api/admin/users/password-reset-requests/{requestId}/reject:
 *   post:
 *     tags: [Authentication]
 *     summary: Reject administrative password reset request
 *     description: Reject password reset request for backoffice roles (Platform Admin only)
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
 *         description: Request rejected successfully
 *       400:
 *         description: Request not found or not in pending status
 *       403:
 *         description: Forbidden - Platform admin required
 */
router.post('/password-reset-requests/:requestId/reject', authenticateToken, authorizeRoles('admin'), adminUserController.rejectPasswordResetRequest);


/**
 * @swagger
 * /api/admin/users/{userid}:
 *   get:
 *     tags: [Authentication]
 *     summary: Get user details
 *     description: Get detailed information about a specific user (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User details retrieved
 *       404:
 *         description: User not found
 *       403:
 *         description: Forbidden
 */
router.get('/:userid', authenticateToken, authorizeRoles('admin', 'supervisor', 'support'), adminUserController.getUserDetails);

/**
 * @swagger
 * /api/admin/users/{userid}/role:
 *   patch:
 *     tags: [Authentication]
 *     summary: Change user platform role
 *     description: Update user's platform role (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userid
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
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 example: "properties_example"
 *                 enum: [user, admin, supervisor, support]
 *             example:
 *               role: supervisor
 *     responses:
 *       200:
 *         description: Role updated successfully
 *       400:
 *         description: Invalid role or cannot demote self
 *       403:
 *         description: Forbidden
 */
router.patch('/:userid/role', authenticateToken, authorizeRoles('admin'), adminUserController.changeUserRole);

/**
 * @swagger
 * /api/admin/users/{userid}/suspend:
 *   post:
 *     tags: [Authentication]
 *     summary: Suspend user
 *     description: Suspend user account (soft delete) (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userid
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
 *                 example: "properties_example"
 *                 minLength: 10
 *             example:
 *               reason: Violation of terms of service
 *     responses:
 *       200:
 *         description: User suspended
 *       400:
 *         description: Cannot suspend self or already suspended
 *       403:
 *         description: Forbidden
 */
router.post('/:userid/suspend', authenticateToken, authorizeRoles('admin', 'supervisor'), adminUserController.suspendUser);

/**
 * @swagger
 * /api/admin/users/{userid}/restore:
 *   post:
 *     tags: [Authentication]
 *     summary: Restore suspended user
 *     description: Restore a suspended user account (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User restored
 *       400:
 *         description: User not suspended
 *       403:
 *         description: Forbidden
 */
router.post('/:userid/restore', authenticateToken, authorizeRoles('admin', 'supervisor'), adminUserController.restoreUser);

/**
 * @swagger
 * /api/admin/users/{userid}:
 *   delete:
 *     tags: [Authentication]
 *     summary: Delete user permanently
 *     description: Permanently delete user account (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deleted permanently
 *       400:
 *         description: Cannot delete self
 *       403:
 *         description: Forbidden
 */
router.delete('/:userid', authenticateToken, authorizeRoles('admin'), adminUserController.deleteUser);

/**
 * @swagger
 * /api/admin/users/{userid}/reset-password:
 *   post:
 *     tags: [Authentication]
 *     summary: Force password reset
 *     description: Invalidate user tokens and force password reset (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Password reset initiated
 *       403:
 *         description: Forbidden
 */
router.post('/:userid/reset-password', authenticateToken, authorizeRoles('admin', 'supervisor'), adminUserController.forcePasswordReset);

/**
 * @swagger
 * /api/admin/users/{userid}/activity:
 *   get:
 *     tags: [Authentication]
 *     summary: Get user activity log
 *     description: Get user activity from audit logs (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Activity log retrieved
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */
router.get('/:userid/activity', authenticateToken, authorizeRoles('admin', 'supervisor', 'support'), adminUserController.getUserActivity);

module.exports = router;
