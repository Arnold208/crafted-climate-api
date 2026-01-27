const notificationService = require('../../services/notification.service');

/**
 * User Notification Controller
 * User-facing notification operations
 */
class NotificationController {

    /**
     * Get my notifications
     */
    async getMyNotifications(req, res) {
        try {
            const userid = req.user.userid;

            const filters = {
                read: req.query.read === 'true' ? true : req.query.read === 'false' ? false : undefined,
                category: req.query.category,
                type: req.query.type
            };

            const pagination = {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 50
            };

            const result = await notificationService.getUserNotifications(userid, filters, pagination);

            res.status(200).json({
                success: true,
                data: result.notifications,
                pagination: result.pagination,
                unreadCount: result.unreadCount
            });
        } catch (error) {
            console.error('[NotificationController] Get notifications error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Mark notification as read
     */
    async markAsRead(req, res) {
        try {
            const { notificationId } = req.params;
            const userid = req.user.userid;

            const notification = await notificationService.markAsRead(notificationId, userid);

            res.status(200).json({
                success: true,
                message: 'Notification marked as read',
                data: notification
            });
        } catch (error) {
            console.error('[NotificationController] Mark as read error:', error);
            res.status(404).json({ success: false, message: error.message });
        }
    }

    /**
     * Mark all as read
     */
    async markAllAsRead(req, res) {
        try {
            const userid = req.user.userid;

            const result = await notificationService.markAllAsRead(userid);

            res.status(200).json(result);
        } catch (error) {
            console.error('[NotificationController] Mark all as read error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Delete notification
     */
    async deleteNotification(req, res) {
        try {
            const { notificationId } = req.params;
            const userid = req.user.userid;

            const result = await notificationService.deleteNotification(notificationId, userid);

            res.status(200).json(result);
        } catch (error) {
            console.error('[NotificationController] Delete error:', error);
            res.status(404).json({ success: false, message: error.message });
        }
    }

    /**
     * Get my preferences
     */
    async getPreferences(req, res) {
        try {
            const userid = req.user.userid;

            const prefs = await notificationService.getUserPreferences(userid);

            res.status(200).json({
                success: true,
                data: prefs
            });
        } catch (error) {
            console.error('[NotificationController] Get preferences error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Update my preferences
     */
    async updatePreferences(req, res) {
        try {
            const userid = req.user.userid;
            const updates = req.body;

            const prefs = await notificationService.updateUserPreferences(userid, updates);

            res.status(200).json({
                success: true,
                message: 'Preferences updated successfully',
                data: prefs
            });
        } catch (error) {
            console.error('[NotificationController] Update preferences error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }
}

module.exports = new NotificationController();
