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
     *
     * This always resets invalid:false — the core self-healing fix.
     * If the token was previously dead-marked, it is revived here.
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

    // ── GET /api/notifications/token-status ───────────────────────────────
    /**
     * Self-healing endpoint called by the mobile app on foreground resume.
     * Returns the health of the current user's FCM token so the app can decide
     * whether to force re-register.
     *
     * Response:
     * {
     *   hasToken: boolean,
     *   invalid: boolean,          — true means the token is dead and must be re-registered
     *   shouldReregister: boolean, — convenience flag: true if the app MUST re-register now
     *   tokenPartial: string,      — first 20 chars for logging only
     *   lastActiveAt: string,
     *   validTokens: number,
     * }
     */
    async getTokenStatus(req, res) {
        try {
            const status = await pushService.getTokenStatusForUser(req.user.userid);

            const shouldReregister =
                !status.hasToken ||                          // never registered
                status.invalid ||                            // dead token
                status.validTokens === 0;                    // all tokens invalid

            return res.status(200).json({
                success: true,
                data: {
                    ...status,
                    shouldReregister,
                },
            });
        } catch (error) {
            console.error('[NotificationController] getTokenStatus:', error);
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
     * Body (multipart/form-data or application/json):
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
     *   image?:    File     ← optional image file (uploaded inline, multipart/form-data)
     *   data?:     object   ← extra key-value pairs sent to device
     * }
     *
     * If an image file is attached, it is uploaded to Azure Blob Storage first
     * and the permanent public URL is embedded in the notification automatically.
     * No separate upload step is needed.
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
                data,
            } = req.body;

            if (!title || !body) {
                return res.status(400).json({ success: false, message: 'title and body are required' });
            }
            if (!target) {
                return res.status(400).json({ success: false, message: "target is required: 'single', 'group', or 'all'" });
            }

            // ── Inline image upload ──────────────────────────────────────────
            let imageUrl;
            if (req.file) {
                const { buffer, originalname, mimetype } = req.file;
                if (!mimetype.startsWith('image/')) {
                    return res.status(400).json({ success: false, message: 'Attached file must be an image' });
                }
                imageUrl = await pushService.uploadNotificationImage(buffer, originalname, mimetype);
            }

            const payload = { title, body, type, imageUrl, data: data || {} };
            let result;

            switch (target) {
                case 'single': {
                    const identifier = email || userId;
                    if (!identifier) {
                        return res.status(400).json({
                            success: false,
                            message: "Provide 'email' or 'userId' for target='single'",
                        });
                    }
                    result = await pushService.sendToEmail(identifier, payload);

                    // ── Enrich response with diagnosis when nothing was sent ──
                    const diagMsg = result.error
                        ? `User not found: ${identifier}`
                        : result.sent === 0 && result.failed === 0
                            ? _describeSentZero(result)
                            : `Notification sent (sent=${result.sent}, failed=${result.failed})`;

                    return res.status(200).json({
                        success:   result.sent > 0 || (!result.error && result.sent === 0 && result.skipped === 'push_disabled'),
                        message:   diagMsg,
                        imageUrl:  imageUrl || null,
                        result: {
                            sent:        result.sent,
                            failed:      result.failed,
                            invalidated: result.invalidated,
                            skipped:     result.skipped || null,
                            reason:      result.reason  || null,
                        },
                    });
                }

                case 'group': {
                    if (!emails.length) {
                        return res.status(400).json({
                            success: false,
                            message: "Provide 'emails' array for target='group'",
                        });
                    }
                    result = await pushService.queueToEmails(emails, payload);

                    return res.status(200).json({
                        success: true,
                        message: `Notification queued to ${emails.length} addresses (${result.jobCount} job${result.jobCount !== 1 ? 's' : ''})`,
                        imageUrl:  imageUrl || null,
                        queued:    emails.length - (result.notFound?.length ?? 0),
                        notFound:  result.notFound ?? [],
                        jobCount:  result.jobCount,
                    });
                }

                case 'all': {
                    result = await pushService.queueToAll(payload);

                    return res.status(200).json({
                        success:  true,
                        message:  'Notification queued for all users via FCM topic broadcast',
                        imageUrl: imageUrl || null,
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

    // ── GET /api/admin/notifications/token-health/:emailOrId ──────────────
    /**
     * Admin diagnostic: check the FCM token health for any user.
     * Useful when a user reports "I'm not receiving notifications".
     *
     * Response:
     * {
     *   found: boolean,
     *   userid: string,
     *   hasToken: boolean,
     *   invalid: boolean,
     *   shouldReregister: boolean,
     *   validTokens: number,
     *   totalTokens: number,
     *   lastActiveAt: string,
     *   platform: string,
     * }
     */
    async getTokenHealth(req, res) {
        try {
            const emailOrId = req.params.emailOrId;
            if (!emailOrId) {
                return res.status(400).json({ success: false, message: 'emailOrId param is required' });
            }

            const health = await pushService.getTokenHealthForUser(emailOrId);

            if (!health.found) {
                return res.status(404).json({ success: false, message: `User not found: ${emailOrId}` });
            }

            return res.status(200).json({
                success: true,
                data: {
                    ...health,
                    shouldReregister: !health.hasToken || health.invalid || health.validTokens === 0,
                    diagnosis: _tokenDiagnosis(health),
                },
            });
        } catch (error) {
            console.error('[AdminPushController] getTokenHealth:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Human-readable diagnosis message for admin dashboard.
 */
function _tokenDiagnosis(health) {
    if (!health.hasToken) {
        return '🔴 No FCM token registered. User has never received push notifications on this device, or token was purged by the 90-day TTL.';
    }
    if (health.invalid) {
        return `🔴 Token is marked INVALID. FCM rejected it (dead token). The device must re-register. Last active: ${health.lastActiveAt}.`;
    }
    if (health.validTokens === 0) {
        return '🟡 All tokens for this user are invalid. Device must re-register.';
    }
    return `✅ ${health.validTokens} valid token(s). Last active: ${health.lastActiveAt}.`;
}

/**
 * Human-readable explanation of why sent=0 and failed=0.
 * This is the "mystery" result the admin was seeing.
 */
function _describeSentZero(result) {
    if (result.skipped === 'push_disabled') {
        return 'Notification skipped — user has push notifications disabled in their settings.';
    }
    if (result.reason) {
        return `Sent=0: ${result.reason}. The device must re-register its FCM token. Ask the user to restart the app.`;
    }
    return 'Sent=0, Failed=0 — no valid FCM tokens found for this user. The device needs to re-register.';
}

module.exports = {
    notificationController: new NotificationController(),
    adminPushController:    new AdminPushController(),
    upload,
};
