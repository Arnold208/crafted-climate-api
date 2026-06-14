const express = require('express');
const router = express.Router();
const adminAuditController = require('./adminAudit.controller');
const authenticateToken = require('../../middleware/bearermiddleware');
const authorizeRoles = require('../../middleware/rbacMiddleware');

/**
 * @swagger
 * /api/admin/audit-logs:
 *   get:
 *     tags: [Audit Logs]
 *     summary: Get all audit logs
 *     description: Query audit logs with filters (Platform Admin only)
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
 *           default: 100
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: userid
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
 *     responses:
 *       200:
 *         description: Audit logs retrieved
 */
router.get('/', authenticateToken, authorizeRoles('admin', 'supervisor', 'support'), adminAuditController.getAllLogs);

/**
 * @swagger
 * /api/admin/audit-logs/user/{userid}:
 *   get:
 *     tags: [Audit Logs]
 *     summary: Get user-specific audit logs
 *     description: Get audit logs for specific user (Platform Admin only)
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
 *     responses:
 *       200:
 *         description: User audit logs retrieved
 */
router.get('/user/:userid', authenticateToken, authorizeRoles('admin', 'supervisor', 'support'), adminAuditController.getUserLogs);

/**
 * @swagger
 * /api/admin/audit-logs/organization/{orgId}:
 *   get:
 *     tags: [Audit Logs]
 *     summary: Get organization-specific audit logs
 *     description: Get audit logs for specific organization (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
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
 *     responses:
 *       200:
 *         description: Organization audit logs retrieved
 */
router.get('/organization/:orgId', authenticateToken, authorizeRoles('admin', 'supervisor', 'support'), adminAuditController.getOrganizationLogs);

/**
 * @swagger
 * /api/admin/audit-logs/export:
 *   post:
 *     tags: [Audit Logs]
 *     summary: Export audit logs
 *     description: Export audit logs to CSV/JSON (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               format:
 *                 type: string
 *                 example: "2026-06-12T11:29:56Z"
 *                 enum: [json, csv]
 *                 default: json
 *               action:
 *                 type: string
 *                 example: "device:register"
 *               userid:
 *                 type: string
 *                 example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
 *               startDate:
 *                 type: string
 *                 example: "2026-06-01T00:00:00Z"
 *                 format: date
 *               endDate:
 *                 type: string
 *                 example: "properties_example"
 *                 format: date
 *     responses:
 *       200:
 *         description: Export initiated
 */
router.post('/export', authenticateToken, authorizeRoles('admin', 'supervisor', 'support'), adminAuditController.exportLogs);

module.exports = router;
