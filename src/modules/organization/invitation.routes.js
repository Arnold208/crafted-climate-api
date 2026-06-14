const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const invitationController = require('./invitation.controller');

/**
 * @swagger
 * /api/org/{orgId}/invite:
 *   post:
 *     summary: Invite a user to an organization
 *     tags: [Invitations]
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
 *             required: [email, accessLevel]
 *             properties:
 *               email:
 *                 type: string
 *                 example: "developer@craftedclimate.com"
 *               accessLevel:
 *                 type: string
 *                 example: "properties_example"
 *                 enum: ['org-admin', 'org-support', 'org-user', 'viewer', 'editor', 'admin', 'support', 'user']
 *     responses:
 *       201:
 *         description: Invitation sent successfully
 *       400:
 *         description: Invalid input or user is already a member
 *       403:
 *         description: Unauthorized or limit reached
 */
router.post('/:orgId/invite', auth, invitationController.inviteMember);

/**
 * @swagger
 * /api/org/invitations/my-invitations:
 *   get:
 *     summary: List pending invitations for the logged-in user
 *     tags: [Invitations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of invitations
 */
router.get('/invitations/my-invitations', auth, invitationController.getMyInvitations);

/**
 * @swagger
 * /api/org/invitations/{token}/accept:
 *   post:
 *     summary: Accept an invitation to join an organization
 *     tags: [Invitations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invitation accepted successfully
 *       400:
 *         description: Invalid or expired token
 *       403:
 *         description: Token does not match logged-in user email
 */
router.post('/invitations/:token/accept', auth, invitationController.acceptInvitation);

/**
 * @swagger
 * /api/org/invitations/{token}/decline:
 *   post:
 *     summary: Decline an invitation to join an organization
 *     tags: [Invitations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invitation declined successfully
 *       404:
 *         description: Invitation not found
 */
router.post('/invitations/:token/decline', auth, invitationController.declineInvitation);

module.exports = router;
