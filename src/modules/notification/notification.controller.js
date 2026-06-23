const notificationService = require('../../services/notification.service');
const pushService         = require('../../services/push.service');
const { upload }          = require('../../config/storage/storage');  // existing multer
const path                = require('path');

/**
 * User Notification Controller
 * Handles in-app notifications + FCM token registration
 */
class NotificationController {

    // ── GET /api/notifications ─────────────────────────────────────────────
    async getMyNotifications(req, res) {
        try {
            const userid = req.user.userid;
            const filters = {
                read:     req.query.read === 'true' ? true : req.query.read === 'false' ? false : undefined,
                category: req.query.category,
                type:     req.query.type,
            };
            const pagination = {
                page:  parseInt(req.query.page)  || 1,
                limit: parseInt(req.query.limit) || 50,
            };
            const result = await notificationService.getUserNotifications(userid, filters, pagination);
            res.status(200).json({ success: true, data: result.notifications, pagination: result.pagination, unreadCount: result.unreadCount });
        } catch (error) {
            console.error('[NotificationController] getMyNotifications:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // ── PATCH /api/notifications/:notificationId/read ─────────────────────
    async markAsRead(req, res) {
        try {
            const notification = await notificationService.markAsRead(req.params.notificationId, req.user.userid);
            res.status(200).json({ success: true, message: 'Notification marked as read', data: notification });
        } catch (error) {
            res.status(404).json({ success: false, message: error.message });
        }
    }

    // ── PATCH /api/notifications/read-all ─────────────────────────────────
    async markAllAsRead(req, res) {
        try {
            const result = await notificationService.markAllAsRead(req.user.userid);
            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // ── DELETE /api/notifications/:notificationId ─────────────────────────
    async deleteNotification(req, res) {
        try {
            const result = await notificationService.deleteNotification(req.params.notificationId, req.user.userid);
            res.status(200).json(result);
        } catch (error) {
            res.status(404).json({ success: false, message: error.message });
        }
    }

    // ── GET /api/notifications/preferences ───────────────────────────────
    async getPreferences(req, res) {
        try {
            const prefs = await notificationService.getUserPreferences(req.user.userid);
            res.status(200).json({ success: true, data: prefs });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // ── PATCH /api/notifications/preferences ─────────────────────────────
    async updatePreferences(req, res) {
        try {
            const prefs = await notificationService.updateUserPreferences(req.user.userid, req.body);
            res.status(200).json({ success: true, message: 'Preferences updated successfully', data: prefs });
        } catch (error) {
            res.status(400).json({ success: false, message: error.message });
        }
    }

    // ── POST /api/notifications/register-token ────────────────────────────
    /**
     * Called by the mobile app after login or whenever the FCM token refreshes.
     * Body: { token: string, platform?: 'android'|'ios', deviceId?: string }
     */
    async registerToken(req, res) {
        try {
            const { token, platform = 'android', deviceId } = req.body;
            if (!token) return res.status(400).json({ success: false, message: 'token is required' });

            await pushService.registerToken(req.user.userid, token, platform, deviceId || null);
            res.status(200).json({ success: true, message: 'FCM token registered' });
        } catch (error) {
            console.error('[NotificationController] registerToken:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // ── DELETE /api/notifications/unregister-token ────────────────────────
    /**
     * Called by the mobile app on logout to stop notifications to this device.
     * Body: { token: string }
     */
    async unregisterToken(req, res) {
        try {
            const { token } = req.body;
            if (!token) return res.status(400).json({ success: false, message: 'token is required' });

            await pushService.invalidateToken(req.user.userid, token);
            res.status(200).json({ success: true, message: 'FCM token unregistered' });
        } catch (error) {
            console.error('[NotificationController] unregisterToken:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Admin Push Notification Controller
 * Protected by admin-only middleware (applied in routes)
 */
class AdminPushController {

    // ── POST /api/admin/notifications/send ───────────────────────────────
    /**
     * Body:
     * {
     *   target:    'single' | 'group' | 'all',
     *
     *   // single:
     *   email?:    string   ← target user email  (preferred)
     *   userId?:   string   ← target user id     (alternative)
     *
     *   // group:
     *   emails:    string[] ← array of email addresses
     *
     *   // all: no targeting needed
     *
     *   title:     string,
     *   body:      string,
     *   type:      'general' | 'promotion' | 'alert',
     *   imageUrl?: string,    ← from upload-image endpoint
     *   data?:     object     ← extra key-value pairs sent to device
     * }
     */
    async send(req, res) {
        try {
            const {
                target,
                email,          // single — by email
                userId,         // single — by userId (fallback)
                emails = [],    // group  — array of emails
                title,
                body,
                type = 'general',
                imageUrl,
                data,
            } = req.body;

            if (!title || !body) {
                return res.status(400).json({ success: false, message: 'title and body are required' });
            }
            if (!target) {
                return res.status(400).json({ success: false, message: "target is required: 'single', 'group', or 'all'" });
            }

            const payload = { title, body, type, imageUrl, data: data || {} };
            let result;

            switch (target) {
                case 'single': {
                    // Accept either email or userId — email takes priority
                    const identifier = email || userId;
                    if (!identifier) {
                        return res.status(400).json({
                            success: false,
                            message: "Provide 'email' or 'userId' for target='single'",
                        });
                    }
                    // sendToEmail handles both email strings and userId strings
                    result = await pushService.sendToEmail(identifier, payload);

                    return res.status(200).json({
                        success: true,
                        message: result.error
                            ? `User not found: ${identifier}`
                            : `Notification sent (sent=${result.sent}, failed=${result.failed})`,
                        result,
                    });
                }

                case 'group': {
                    if (!emails.length) {
                        return res.status(400).json({
                            success: false,
                            message: "Provide 'emails' array for target='group'",
                        });
                    }
                    // One DB query resolves all emails → userIds, then chunks into queue jobs
                    result = await pushService.queueToEmails(emails, payload);

                    return res.status(200).json({
                        success: true,
                        message: `Notification queued to ${emails.length} addresses (${result.jobCount} job${result.jobCount !== 1 ? 's' : ''})`,
                        queued:    emails.length - (result.notFound?.length ?? 0),
                        notFound:  result.notFound ?? [],
                        jobCount:  result.jobCount,
                    });
                }

                case 'all': {
                    // FCM topic broadcast — Firebase handles delivery fanout
                    result = await pushService.queueToAll(payload);

                    return res.status(200).json({
                        success: true,
                        message: 'Notification queued for all users via FCM topic broadcast',
                        jobCount: result.jobCount,
                    });
                }

                default:
                    return res.status(400).json({
                        success: false,
                        message: "target must be 'single', 'group', or 'all'",
                    });
            }
        } catch (error) {
            console.error('[AdminPushController] send:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }


    // ── POST /api/admin/notifications/upload-image ───────────────────────
    /**
     * Accepts multipart/form-data with field name "image".
     * Returns: { success: true, imageUrl: "https://..." }
     *
     * The returned URL is permanent, never expires, and can be used
     * directly in the send endpoint's imageUrl field.
     */
    async uploadImage(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No image file provided (field: image)' });
            }

            const { buffer, originalname, mimetype } = req.file;

            // Validate: images only
            if (!mimetype.startsWith('image/')) {
                return res.status(400).json({ success: false, message: 'File must be an image' });
            }

            const imageUrl = await pushService.uploadNotificationImage(buffer, originalname, mimetype);

            res.status(200).json({
                success:  true,
                imageUrl,
                message:  'Image uploaded successfully. Use imageUrl in your send request.',
            });
        } catch (error) {
            console.error('[AdminPushController] uploadImage:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // ── GET /api/admin/notifications/queue-status ─────────────────────────
    async queueStatus(req, res) {
        try {
            const { pushQueue } = require('../../config/queue/bullMQ/pushQueue');
            const [waiting, active, completed, failed, delayed] = await Promise.all([
                pushQueue.getWaitingCount(),
                pushQueue.getActiveCount(),
                pushQueue.getCompletedCount(),
                pushQueue.getFailedCount(),
                pushQueue.getDelayedCount(),
            ]);
            res.status(200).json({
                success: true,
                queue:   'push_notifications',
                counts:  { waiting, active, completed, failed, delayed },
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = {
    notificationController: new NotificationController(),
    adminPushController:    new AdminPushController(),
    upload,
};
