const ticketService = require('../../services/ticket.service');

/**
 * User Ticket Controller
 * Customer-facing ticket operations
 */
class UserTicketController {

    /**
     * Create new ticket
     */
    async createTicket(req, res) {
        try {
            const userid = req.user.userid;
            const { subject, description, priority, category, organizationId } = req.body;

            if (!subject || !description) {
                return res.status(400).json({
                    success: false,
                    message: 'Subject and description are required'
                });
            }

            if (!organizationId) {
                return res.status(400).json({
                    success: false,
                    message: 'Organization ID is required'
                });
            }

            // Verify user belongs to organization
            if (!req.user.organization.includes(organizationId)) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have access to this organization'
                });
            }

            const result = await ticketService.createTicket({
                subject,
                description,
                priority,
                category,
                organizationId
            }, userid, req);

            res.status(201).json({
                success: true,
                message: 'Support ticket created successfully',
                data: result.ticket
            });
        } catch (error) {
            console.error('[UserTicketController] Create error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * List user's tickets
     */
    async listMyTickets(req, res) {
        try {
            const userid = req.user.userid;

            const filters = {
                userid,
                status: req.query.status,
                priority: req.query.priority,
                organizationId: req.query.organizationId
            };

            const pagination = {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 50
            };

            const result = await ticketService.listTickets(filters, pagination, false);

            res.status(200).json({
                success: true,
                data: result.tickets,
                pagination: result.pagination
            });
        } catch (error) {
            console.error('[UserTicketController] List error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Get ticket details
     */
    async getTicketDetails(req, res) {
        try {
            const { ticketId } = req.params;
            const userid = req.user.userid;

            const ticket = await ticketService.getTicketDetails(ticketId, userid, false);

            res.status(200).json({
                success: true,
                data: ticket
            });
        } catch (error) {
            console.error('[UserTicketController] Get details error:', error);
            res.status(404).json({ success: false, message: error.message });
        }
    }

    /**
     * Reply to ticket
     */
    async replyToTicket(req, res) {
        try {
            const { ticketId } = req.params;
            const { message } = req.body;
            const userid = req.user.userid;

            if (!message) {
                return res.status(400).json({
                    success: false,
                    message: 'Message is required'
                });
            }

            const reply = await ticketService.replyToTicket(ticketId, userid, message, false);

            res.status(201).json({
                success: true,
                message: 'Reply added successfully',
                data: reply
            });
        } catch (error) {
            console.error('[UserTicketController] Reply error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }
}

module.exports = new UserTicketController();
