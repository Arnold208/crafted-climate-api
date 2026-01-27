const notificationService = require('../../services/notification.service');

/**
 * Admin Notification Controller
 * Admin notification management
 */
class AdminNotificationController {

    /**
     * Send notification to specific users
     */
    async sendNotification(req, res) {
        try {
            const { userids, ...notificationData } = req.body;

            if (!userids || !Array.isArray(userids) || userids.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'userids array is required'
                });
            }

            if (!notificationData.title || !notificationData.message || !notificationData.category) {
                return res.status(400).json({
                    success: false,
                    message: 'title, message, and category are required'
                });
            }

            const notifications = await notificationService.broadcast(userids, notificationData);

            res.status(201).json({
                success: true,
                message: `Notification sent to ${notifications.length} users`,
                data: { sentCount: notifications.length }
            });
        } catch (error) {
            console.error('[AdminNotificationController] Send error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Broadcast to all users
     */
    async broadcastToAll(req, res) {
        try {
            const { role, verified, ...notificationData } = req.body;

            if (!notificationData.title || !notificationData.message || !notificationData.category) {
                return res.status(400).json({
                    success: false,
                    message: 'title, message, and category are required'
                });
            }

            const filters = { role, verified };
            const notifications = await notificationService.broadcastToAll(notificationData, filters);

            res.status(201).json({
                success: true,
                message: `Notification broadcast to ${notifications.length} users`,
                data: { sentCount: notifications.length }
            });
        } catch (error) {
            console.error('[AdminNotificationController] Broadcast error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Get notification statistics
     */
    async getStatistics(req, res) {
        try {
            const filters = {
                userid: req.query.userid,
                startDate: req.query.startDate,
                endDate: req.query.endDate
            };

            const stats = await notificationService.getStatistics(filters);

            res.status(200).json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('[AdminNotificationController] Stats error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = new AdminNotificationController();
