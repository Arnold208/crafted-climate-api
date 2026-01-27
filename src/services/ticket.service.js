const SupportTicket = require('../models/support/SupportTicket');
const TicketMessage = require('../models/support/TicketMessage');
const User = require('../models/user/userModel');
const { v4: uuidv4 } = require('uuid');
const { createAuditLog } = require('../utils/auditLogger');
const notificationService = require('./notification.service');

/**
 * Support Ticket Service
 * Complete ticket lifecycle management
 */
class TicketService {

    /**
     * Create new support ticket
     */
    async createTicket(data, userid, req) {
        const { subject, description, priority, category, organizationId } = data;

        // Get user info
        const user = await User.findOne({ userid }).select('email firstName lastName').lean();
        if (!user) {
            throw new Error('User not found');
        }

        // Create ticket
        const ticket = new SupportTicket({
            organizationId,
            userid,
            subject,
            description,
            priority: priority || 'medium',
            category: category || 'other',
            metadata: {
                userAgent: req.get('user-agent'),
                ipAddress: req.ip,
                platform: 'web'
            }
        });

        await ticket.save();

        // Create initial message
        const message = new TicketMessage({
            messageId: uuidv4(),
            ticketId: ticket.ticketId,
            userid,
            userInfo: {
                email: user.email,
                name: `${user.firstName} ${user.lastName}`,
                role: 'customer'
            },
            message: description,
            isInternal: false
        });

        await message.save();

        // Audit log
        await createAuditLog({
            action: 'TICKET_CREATED',
            userid,
            organizationId,
            details: { ticketId: ticket.ticketId, subject, priority },
            ipAddress: req.ip
        });

        // Send notification to admins about new ticket
        await notificationService.broadcastToAll({
            title: 'New Support Ticket Created',
            message: `New ticket #${ticket.ticketId}: ${subject}`,
            category: 'support',
            type: 'info',
            actionUrl: `/admin/support/tickets/${ticket.ticketId}`,
            channels: ['in_app', 'email']
        }, { role: 'admin' });

        return {
            ticket,
            message
        };
    }

    /**
     * Get ticket details with messages
     */
    async getTicketDetails(ticketId, userid, isAdmin = false) {
        const ticket = await SupportTicket.findOne({ ticketId }).lean();

        if (!ticket) {
            throw new Error('Ticket not found');
        }

        // Check access (user can only see their own tickets, admins can see all)
        if (!isAdmin && ticket.userid !== userid) {
            throw new Error('Access denied');
        }

        // Get messages (exclude internal notes for non-admins)
        const query = { ticketId };
        if (!isAdmin) {
            query.isInternal = false;
        }

        const messages = await TicketMessage.find(query)
            .sort({ createdAt: 1 })
            .lean();

        return {
            ...ticket,
            messages
        };
    }

    /**
     * List tickets with filters
     */
    async listTickets(filters = {}, pagination = {}, isAdmin = false) {
        const {
            userid,
            organizationId,
            status,
            priority,
            assignedTo,
            category,
            search
        } = filters;

        const {
            page = 1,
            limit = 50
        } = pagination;

        const skip = (page - 1) * limit;

        const query = {};

        if (userid && !isAdmin) {
            query.userid = userid;
        }

        if (organizationId) {
            query.organizationId = organizationId;
        }

        if (status) {
            query.status = status;
        }

        if (priority) {
            query.priority = priority;
        }

        if (assignedTo) {
            query.assignedTo = assignedTo;
        }

        if (category) {
            query.category = category;
        }

        if (search) {
            query.$or = [
                { subject: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { ticketId: { $regex: search, $options: 'i' } }
            ];
        }

        const [tickets, total] = await Promise.all([
            SupportTicket.find(query)
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 })
                .lean(),
            SupportTicket.countDocuments(query)
        ]);

        return {
            tickets,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Assign ticket to admin
     */
    async assignTicket(ticketId, assignedTo, assignedBy) {
        const ticket = await SupportTicket.findOne({ ticketId });

        if (!ticket) {
            throw new Error('Ticket not found');
        }

        // Verify assignee is admin
        const admin = await User.findOne({ userid: assignedTo, role: 'admin' });
        if (!admin) {
            throw new Error('Assignee must be an admin');
        }

        ticket.assignedTo = assignedTo;
        ticket.assignedAt = new Date();

        if (ticket.status === 'open') {
            ticket.status = 'in_progress';
        }

        await ticket.save();

        // Audit log
        await createAuditLog({
            action: 'TICKET_ASSIGNED',
            userid: assignedBy,
            organizationId: ticket.organizationId,
            details: { ticketId, assignedTo },
            ipAddress: null
        });

        // Notify assigned admin
        await notificationService.send(assignedTo, {
            title: 'Ticket Assigned to You',
            message: `Ticket #${ticketId} has been assigned to you.`,
            category: 'support',
            type: 'info',
            actionUrl: `/admin/support/tickets/${ticketId}`,
            channels: ['in_app', 'email']
        });

        return ticket;
    }

    /**
     * Reply to ticket
     */
    async replyToTicket(ticketId, userid, messageText, isInternal = false) {
        const ticket = await SupportTicket.findOne({ ticketId });

        if (!ticket) {
            throw new Error('Ticket not found');
        }

        // Get user info
        const user = await User.findOne({ userid }).select('email firstName lastName role').lean();
        if (!user) {
            throw new Error('User not found');
        }

        const isAdmin = user.role === 'admin';

        // Check access
        if (!isAdmin && ticket.userid !== userid) {
            throw new Error('Access denied');
        }

        // Only admins can create internal notes
        if (isInternal && !isAdmin) {
            throw new Error('Only admins can create internal notes');
        }

        // Create message
        const message = new TicketMessage({
            messageId: uuidv4(),
            ticketId,
            userid,
            userInfo: {
                email: user.email,
                name: `${user.firstName} ${user.lastName}`,
                role: isAdmin ? 'admin' : 'customer'
            },
            message: messageText,
            isInternal
        });

        await message.save();

        // Update ticket
        if (isAdmin && !ticket.firstResponseAt && !isInternal) {
            ticket.firstResponseAt = new Date();
            ticket.sla.firstResponseTime = Math.floor((ticket.firstResponseAt - ticket.createdAt) / 60000);
        }

        if (ticket.status === 'waiting_customer' && !isAdmin) {
            ticket.status = 'in_progress';
        } else if (ticket.status === 'in_progress' && isAdmin && !isInternal) {
            ticket.status = 'waiting_customer';
        }

        await ticket.save();

        // Audit log
        await createAuditLog({
            action: 'TICKET_REPLY',
            userid,
            organizationId: ticket.organizationId,
            details: { ticketId, isInternal },
            ipAddress: null
        });

        // Notify other party
        if (!isInternal) {
            const notifyUserId = isAdmin ? ticket.userid : ticket.assignedTo;
            if (notifyUserId) {
                await notificationService.send(notifyUserId, {
                    title: 'New Reply on Ticket',
                    message: `New reply on ticket #${ticketId}.`,
                    category: 'support',
                    type: 'info',
                    actionUrl: isAdmin ? `/support/tickets/${ticketId}` : `/admin/support/tickets/${ticketId}`,
                    channels: ['in_app', 'email']
                });
            }
        }

        return message;
    }

    /**
     * Update ticket status
     */
    async updateTicketStatus(ticketId, status, userid) {
        const ticket = await SupportTicket.findOne({ ticketId });

        if (!ticket) {
            throw new Error('Ticket not found');
        }

        const oldStatus = ticket.status;
        ticket.status = status;

        if (status === 'resolved' && !ticket.resolvedAt) {
            ticket.resolvedAt = new Date();
            ticket.sla.resolutionTime = Math.floor((ticket.resolvedAt - ticket.createdAt) / 60000);
        }

        if (status === 'closed' && !ticket.closedAt) {
            ticket.closedAt = new Date();
        }

        await ticket.save();

        // Audit log
        await createAuditLog({
            action: 'TICKET_STATUS_UPDATED',
            userid,
            organizationId: ticket.organizationId,
            details: { ticketId, oldStatus, newStatus: status },
            ipAddress: null
        });

        return ticket;
    }

    /**
     * Close ticket
     */
    async closeTicket(ticketId, userid) {
        return this.updateTicketStatus(ticketId, 'closed', userid);
    }

    /**
     * Get ticket statistics
     */
    async getTicketStatistics(filters = {}) {
        const { organizationId, assignedTo, startDate, endDate } = filters;

        const query = {};
        if (organizationId) query.organizationId = organizationId;
        if (assignedTo) query.assignedTo = assignedTo;
        if (startDate && endDate) {
            query.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const [
            total,
            byStatus,
            byPriority,
            slaBreached,
            avgFirstResponse,
            avgResolution
        ] = await Promise.all([
            SupportTicket.countDocuments(query),
            SupportTicket.aggregate([
                { $match: query },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]),
            SupportTicket.aggregate([
                { $match: query },
                { $group: { _id: '$priority', count: { $sum: 1 } } }
            ]),
            SupportTicket.countDocuments({ ...query, 'sla.breached': true }),
            SupportTicket.aggregate([
                { $match: { ...query, 'sla.firstResponseTime': { $ne: null } } },
                { $group: { _id: null, avg: { $avg: '$sla.firstResponseTime' } } }
            ]),
            SupportTicket.aggregate([
                { $match: { ...query, 'sla.resolutionTime': { $ne: null } } },
                { $group: { _id: null, avg: { $avg: '$sla.resolutionTime' } } }
            ])
        ]);

        return {
            total,
            byStatus,
            byPriority,
            slaBreached,
            avgFirstResponseMinutes: avgFirstResponse[0]?.avg || 0,
            avgResolutionMinutes: avgResolution[0]?.avg || 0
        };
    }
}

module.exports = new TicketService();
