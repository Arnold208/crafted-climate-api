const ticketService = require('../../services/ticket.service');

/**
 * Admin Ticket Controller
 * Platform admin ticket management
 */
class AdminTicketController {

    /**
     * List all tickets
     */
    async listAllTickets(req, res) {
        try {
            const filters = {
                organizationId: req.query.organizationId,
                status: req.query.status,
                priority: req.query.priority,
                assignedTo: req.query.assignedTo,
                category: req.query.category,
                search: req.query.search
            };

            const pagination = {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 50
            };

            const result = await ticketService.listTickets(filters, pagination, true);

            res.status(200).json({
                success: true,
                data: result.tickets,
                pagination: result.pagination
            });
        } catch (error) {
            console.error('[AdminTicketController] List error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Get ticket details
     */
    async getTicketDetails(req, res) {
        try {
            const { ticketId } = req.params;
            const adminId = req.user.userid;

            const ticket = await ticketService.getTicketDetails(ticketId, adminId, true);

            res.status(200).json({
                success: true,
                data: ticket
            });
        } catch (error) {
            console.error('[AdminTicketController] Get details error:', error);
            res.status(404).json({ success: false, message: error.message });
        }
    }

    /**
     * Assign ticket to admin
     */
    async assignTicket(req, res) {
        try {
            const { ticketId } = req.params;
            const { assignedTo } = req.body;
            const adminId = req.user.userid;

            if (!assignedTo) {
                return res.status(400).json({
                    success: false,
                    message: 'assignedTo is required'
                });
            }

            const ticket = await ticketService.assignTicket(ticketId, assignedTo, adminId);

            res.status(200).json({
                success: true,
                message: 'Ticket assigned successfully',
                data: ticket
            });
        } catch (error) {
            console.error('[AdminTicketController] Assign error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Reply to ticket
     */
    async replyToTicket(req, res) {
        try {
            const { ticketId } = req.params;
            const { message, isInternal } = req.body;
            const adminId = req.user.userid;

            if (!message) {
                return res.status(400).json({
                    success: false,
                    message: 'Message is required'
                });
            }

            const reply = await ticketService.replyToTicket(
                ticketId,
                adminId,
                message,
                isInternal || false
            );

            res.status(201).json({
                success: true,
                message: 'Reply added successfully',
                data: reply
            });
        } catch (error) {
            console.error('[AdminTicketController] Reply error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Update ticket status
     */
    async updateTicketStatus(req, res) {
        try {
            const { ticketId } = req.params;
            const { status } = req.body;
            const adminId = req.user.userid;

            if (!status) {
                return res.status(400).json({
                    success: false,
                    message: 'Status is required'
                });
            }

            const validStatuses = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
                });
            }

            const ticket = await ticketService.updateTicketStatus(ticketId, status, adminId);

            res.status(200).json({
                success: true,
                message: 'Ticket status updated',
                data: ticket
            });
        } catch (error) {
            console.error('[AdminTicketController] Update status error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Close ticket
     */
    async closeTicket(req, res) {
        try {
            const { ticketId } = req.params;
            const adminId = req.user.userid;

            const ticket = await ticketService.closeTicket(ticketId, adminId);

            res.status(200).json({
                success: true,
                message: 'Ticket closed successfully',
                data: ticket
            });
        } catch (error) {
            console.error('[AdminTicketController] Close error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Get ticket statistics
     */
    async getTicketStatistics(req, res) {
        try {
            const filters = {
                organizationId: req.query.organizationId,
                assignedTo: req.query.assignedTo,
                startDate: req.query.startDate,
                endDate: req.query.endDate
            };

            const stats = await ticketService.getTicketStatistics(filters);

            res.status(200).json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('[AdminTicketController] Stats error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = new AdminTicketController();
