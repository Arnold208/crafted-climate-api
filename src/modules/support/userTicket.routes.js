const express = require('express');
const router = express.Router();
const userTicketController = require('./userTicket.controller');
const authenticateToken = require('../../middleware/bearermiddleware');

/**
 * @swagger
 * /api/support/tickets:
 *   post:
 *     tags: [Support]
 *     summary: Create support ticket
 *     description: Create a new support ticket
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subject
 *               - description
 *               - organizationId
 *             properties:
 *               subject:
 *                 type: string
 *                 maxLength: 200
 *               description:
 *                 type: string
 *                 maxLength: 5000
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *                 default: medium
 *               category:
 *                 type: string
 *                 enum: [technical, billing, feature_request, bug, account, other]
 *               organizationId:
 *                 type: string
 *             example:
 *               subject: Unable to upload telemetry data
 *               description: Getting 500 error when trying to upload sensor data
 *               priority: high
 *               category: technical
 *               organizationId: org-123
 *     responses:
 *       201:
 *         description: Ticket created successfully
 */
router.post('/', authenticateToken, userTicketController.createTicket);

/**
 * @swagger
 * /api/support/tickets:
 *   get:
 *     tags: [Support]
 *     summary: List my tickets
 *     description: Get all tickets created by current user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, in_progress, waiting_customer, resolved, closed]
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tickets retrieved
 */
router.get('/', authenticateToken, userTicketController.listMyTickets);

/**
 * @swagger
 * /api/support/tickets/{ticketId}:
 *   get:
 *     tags: [Support]
 *     summary: Get ticket details
 *     description: View ticket with all messages
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ticket details retrieved
 *       404:
 *         description: Ticket not found or access denied
 */
router.get('/:ticketId', authenticateToken, userTicketController.getTicketDetails);

/**
 * @swagger
 * /api/support/tickets/{ticketId}/reply:
 *   post:
 *     tags: [Support]
 *     summary: Reply to ticket
 *     description: Add a reply to your ticket
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
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
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *             example:
 *               message: I tried the suggested fix but still getting the error
 *     responses:
 *       201:
 *         description: Reply added
 */
router.post('/:ticketId/reply', authenticateToken, userTicketController.replyToTicket);

module.exports = router;
