const SupportTicket = require('../models/support/SupportTicket');
const notificationService = require('../services/notification.service');

/**
 * SLA Breach Detection Cron
 * Runs every hour to check for overdue tickets
 */
async function startSLABreachCron() {
    setInterval(async () => {
        console.log('[Cron] Checking for SLA breaches...');

        try {
            const now = new Date();

            // Find open/in_progress tickets that aren't already breached
            const tickets = await SupportTicket.find({
                status: { $in: ['open', 'in_progress', 'waiting_customer'] },
                'sla.breached': false
            });

            let breachedCount = 0;

            for (const ticket of tickets) {
                const limitDate = new Date(ticket.createdAt.getTime() + (ticket.sla.resolutionLimit * 60 * 60 * 1000));

                if (now > limitDate) {
                    ticket.sla.breached = true;
                    await ticket.save();
                    breachedCount++;

                    // Notify admins of breach
                    await notificationService.broadcastToAll({
                        title: '🚨 SLA BREACH: Ticket Overdue',
                        message: `Ticket #${ticket.ticketId} (${ticket.priority}) has exceeded its resolution SLA.`,
                        category: 'system',
                        type: 'error',
                        actionUrl: `/admin/support/tickets/${ticket.ticketId}`,
                        channels: ['in_app', 'email']
                    }, { role: 'admin' });
                }
            }

            if (breachedCount > 0) {
                console.log(`[Cron] SLA Breach detection complete. Found ${breachedCount} new breaches.`);
            }
        } catch (error) {
            console.error('[Cron] SLA Breach error:', error.message);
        }
    }, 60 * 60 * 1000); // 1 hour
}

module.exports = { startSLABreachCron };
