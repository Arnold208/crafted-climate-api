const express = require('express');
const router = express.Router();
const adminUserController = require('./adminUser.controller');
const authenticateToken = require('../../middleware/bearermiddleware');
const authorizeRoles = require('../../middleware/rbacMiddleware');
const requirePlatformAdmin = require('../../middleware/requirePlatformAdmin');

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
 *           example: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *           default: 50
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           example: "search_example"
 *         description: Search by email, username, or name
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           example: "editor"
 *           enum: [user, admin]
 *       - in: query
 *         name: verified
 *         schema:
 *           type: boolean
 *           example: true
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: string
 *           example: "deleted_example"
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
 *           example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
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
 *           example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
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
 *           example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
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
 *           example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
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
 *           example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
 *     responses:
 *       200:
 *         description: User deleted permanently
 *       400:
 *         description: Cannot delete self
 *       403:
 *         description: Forbidden
 */
router.delete('/:userid', authenticateToken, requirePlatformAdmin, adminUserController.deleteUser);

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
 *           example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
 *     responses:
 *       200:
 *         description: Password reset initiated
 *       403:
 *         description: Forbidden
 */
router.post('/:userid/reset-password', authenticateToken, requirePlatformAdmin, adminUserController.forcePasswordReset);

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
 *           example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           example: "2026-06-01T00:00:00Z"
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           example: "2026-06-12T00:00:00Z"
 *           format: date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
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
