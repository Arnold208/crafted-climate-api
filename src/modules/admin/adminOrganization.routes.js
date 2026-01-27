const express = require('express');
const router = express.Router();
const adminOrgController = require('./adminOrganization.controller');
const authenticateToken = require('../../middleware/bearermiddleware');
const requirePlatformAdmin = require('../../middleware/requirePlatformAdmin');

/**
 * @swagger
 * /api/admin/organizations:
 *   get:
 *     tags: [Organizations]
 *     summary: List all organizations
 *     description: Get paginated list of organizations with filters (Platform Admin only)
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
 *         description: Search by organization name
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [personal, business, non-profit]
 *       - in: query
 *         name: verified
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: partner
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Organizations retrieved
 *       403:
 *         description: Forbidden
 */
router.get('/', authenticateToken, requirePlatformAdmin, adminOrgController.listOrganizations);

/**
 * @swagger
 * /api/admin/organizations/{orgId}:
 *   get:
 *     tags: [Organizations]
 *     summary: Get organization details
 *     description: Get detailed information about an organization (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Organization details retrieved
 *       404:
 *         description: Organization not found
 */
router.get('/:orgId', authenticateToken, requirePlatformAdmin, adminOrgController.getOrganizationDetails);

/**
 * @swagger
 * /api/admin/organizations/{orgId}:
 *   delete:
 *     tags: [Organizations]
 *     summary: Delete organization
 *     description: Permanently delete organization (Platform Admin only). Cannot delete orgs with members or devices.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Organization deleted
 *       400:
 *         description: Cannot delete (has members/devices or is personal org)
 */
router.delete('/:orgId', authenticateToken, requirePlatformAdmin, adminOrgController.deleteOrganization);

/**
 * @swagger
 * /api/admin/organizations/{orgId}/suspend:
 *   post:
 *     tags: [Organizations]
 *     summary: Suspend organization
 *     description: Suspend organization (Platform Admin only)
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
 *                 minLength: 10
 *             example:
 *               reason: Violation of terms of service
 *     responses:
 *       200:
 *         description: Organization suspended
 *       400:
 *         description: Cannot suspend personal organization
 */
router.post('/:orgId/suspend', authenticateToken, requirePlatformAdmin, adminOrgController.suspendOrganization);

/**
 * @swagger
 * /api/admin/organizations/{orgId}/members:
 *   get:
 *     tags: [Organizations]
 *     summary: Get organization members
 *     description: List all members of an organization (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Members retrieved
 *       404:
 *         description: Organization not found
 */
router.get('/:orgId/members', authenticateToken, requirePlatformAdmin, adminOrgController.getMembers);

/**
 * @swagger
 * /api/admin/organizations/{orgId}/transfer-owner:
 *   post:
 *     tags: [Organizations]
 *     summary: Transfer organization ownership
 *     description: Transfer ownership to another member (Platform Admin only)
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
 *               - newOwnerId
 *             properties:
 *               newOwnerId:
 *                 type: string
 *             example:
 *               newOwnerId: PM85RAIXJB
 *     responses:
 *       200:
 *         description: Ownership transferred
 *       400:
 *         description: New owner must be a member
 */
router.post('/:orgId/transfer-owner', authenticateToken, requirePlatformAdmin, adminOrgController.transferOwnership);

module.exports = router;
