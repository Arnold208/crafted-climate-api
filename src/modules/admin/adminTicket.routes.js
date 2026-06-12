const express = require('express');
const router = express.Router();
const adminTicketController = require('./adminTicket.controller');
const authenticateToken = require('../../middleware/bearermiddleware');
const requirePlatformAdmin = require('../../middleware/requirePlatformAdmin');

/**
 * @swagger
 * /api/admin/support/tickets:
 *   get:
 *     tags: [Support]
 *     summary: List all support tickets
 *     description: Get all tickets across platform with filters (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: string
 *           example: "org-starter-uuid"
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           example: "pending"
 *           enum: [open, in_progress, waiting_customer, resolved, closed]
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           example: "high"
 *           enum: [low, medium, high, urgent]
 *       - in: query
 *         name: assignedTo
 *         schema:
 *           type: string
 *           example: "assignedTo_example"
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           example: "hardware"
 *           enum: [technical, billing, feature_request, bug, account, other]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           example: "search_example"
 *     responses:
 *       200:
 *         description: Tickets retrieved
 */
router.get('/', authenticateToken, requirePlatformAdmin, adminTicketController.listAllTickets);

/**
 * @swagger
 * /api/admin/support/tickets/{ticketId}:
 *   get:
 *     tags: [Support]
 *     summary: Get ticket details
 *     description: View ticket with all messages (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *           example: "ticket-9b1deb4d-3b7d"
 *     responses:
 *       200:
 *         description: Ticket details retrieved
 */
router.get('/:ticketId', authenticateToken, requirePlatformAdmin, adminTicketController.getTicketDetails);

/**
 * @swagger
 * /api/admin/support/tickets/{ticketId}/assign:
 *   patch:
 *     tags: [Support]
 *     summary: Assign ticket to admin
 *     description: Assign ticket to specific admin (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *           example: "ticket-9b1deb4d-3b7d"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - assignedTo
 *             properties:
 *               assignedTo:
 *                 type: string
 *                 example: "properties_example"
 *             example:
 *               assignedTo: admin-userid-here
 *     responses:
 *       200:
 *         description: Ticket assigned
 */
router.patch('/:ticketId/assign', authenticateToken, requirePlatformAdmin, adminTicketController.assignTicket);

/**
 * @swagger
 * /api/admin/support/tickets/{ticketId}/reply:
 *   post:
 *     tags: [Support]
 *     summary: Reply to ticket
 *     description: Add reply or internal note to ticket (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *           example: "ticket-9b1deb4d-3b7d"
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
 *                 example: "This is a status update notification."
 *               isInternal:
 *                 type: boolean
 *                 example: true
 *                 description: If true, creates admin-only note
 *             example:
 *               message: We are looking into this issue
 *               isInternal: false
 *     responses:
 *       201:
 *         description: Reply added
 */
router.post('/:ticketId/reply', authenticateToken, requirePlatformAdmin, adminTicketController.replyToTicket);

/**
 * @swagger
 * /api/admin/support/tickets/{ticketId}/status:
 *   patch:
 *     tags: [Support]
 *     summary: Update ticket status
 *     description: Change ticket status (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *           example: "ticket-9b1deb4d-3b7d"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 example: "properties_example"
 *                 enum: [open, in_progress, waiting_customer, resolved, closed]
 *             example:
 *               status: resolved
 *     responses:
 *       200:
 *         description: Status updated
 */
router.patch('/:ticketId/status', authenticateToken, requirePlatformAdmin, adminTicketController.updateTicketStatus);

/**
 * @swagger
 * /api/admin/support/tickets/{ticketId}/close:
 *   patch:
 *     tags: [Support]
 *     summary: Close ticket
 *     description: Close ticket (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *           example: "ticket-9b1deb4d-3b7d"
 *     responses:
 *       200:
 *         description: Ticket closed
 */
router.patch('/:ticketId/close', authenticateToken, requirePlatformAdmin, adminTicketController.closeTicket);

/**
 * @swagger
 * /api/admin/support/tickets/statistics/summary:
 *   get:
 *     tags: [Support]
 *     summary: Get ticket statistics
 *     description: View ticket metrics and SLA performance (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: string
 *           example: "org-starter-uuid"
 *       - in: query
 *         name: assignedTo
 *         schema:
 *           type: string
 *           example: "assignedTo_example"
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
 *     responses:
 *       200:
 *         description: Statistics retrieved
 */
router.get('/statistics/summary', authenticateToken, requirePlatformAdmin, adminTicketController.getTicketStatistics);

module.exports = router;
