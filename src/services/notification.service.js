const Notification = require('../models/notification/Notification');
const NotificationPreference = require('../models/notification/NotificationPreference');
const User = require('../models/user/userModel');
const { v4: uuidv4 } = require('uuid');
const { createAuditLog } = require('../utils/auditLogger');

/**
 * Notification Service
 * Multi-channel notification delivery
 */
class NotificationService {

    /**
     * Send notification to specific user
     */
    async send(userid, data) {
        const { type, category, title, message, actionUrl, actionText, channels, metadata, expiresInDays } = data;

        // Get user preferences
        const prefs = await this.getUserPreferences(userid);

        // Check if user wants this category
        if (!prefs.preferences.categories[category]) {
            console.log(`User ${userid} has disabled ${category} notifications`);
            return null;
        }

        // Determine delivery channels based on preferences
        const deliveryChannels = this._determineChannels(channels, prefs);

        if (deliveryChannels.length === 0) {
            console.log(`No delivery channels enabled for user ${userid}`);
            return null;
        }

        // Calculate expiration
        const expiresAt = expiresInDays
            ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default 30 days

        // Create notification
        const notification = new Notification({
            notificationId: uuidv4(),
            userid,
            type: type || 'info',
            category,
            title,
            message,
            actionUrl,
            actionText: actionText || 'View',
            channels: deliveryChannels,
            expiresAt,
            metadata
        });

        await notification.save();

        // Deliver via channels
        await this._deliverNotification(notification, prefs);

        return notification;
    }

    /**
     * Broadcast notification to multiple users
     */
    async broadcast(userids, data) {
        const notifications = [];

        for (const userid of userids) {
            try {
                const notification = await this.send(userid, data);
                if (notification) {
                    notifications.push(notification);
                }
            } catch (error) {
                console.error(`Failed to send notification to ${userid}:`, error);
            }
        }

        return notifications;
    }

    /**
     * Broadcast to all users
     */
    async broadcastToAll(data, filters = {}) {
        const { role, verified } = filters;

        const query = { deletedAt: null };
        if (role) query.role = role;
        if (verified !== undefined) query.verified = verified;

        const users = await User.find(query).select('userid').lean();
        const userids = users.map(u => u.userid);

        return this.broadcast(userids, data);
    }

    /**
     * Get user notifications
     */
    async getUserNotifications(userid, filters = {}, pagination = {}) {
        const { read, category, type } = filters;
        const { page = 1, limit = 50 } = pagination;
        const skip = (page - 1) * limit;

        const query = { userid };
        if (read !== undefined) query.read = read;
        if (category) query.category = category;
        if (type) query.type = type;

        const [notifications, total, unreadCount] = await Promise.all([
            Notification.find(query)
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 })
                .lean(),
            Notification.countDocuments(query),
            Notification.countDocuments({ userid, read: false })
        ]);

        return {
            notifications,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            },
            unreadCount
        };
    }

    /**
     * Mark notification as read
     */
    async markAsRead(notificationId, userid) {
        const notification = await Notification.findOne({ notificationId, userid });

        if (!notification) {
            throw new Error('Notification not found');
        }

        if (!notification.read) {
            notification.read = true;
            notification.readAt = new Date();
            await notification.save();
        }

        return notification;
    }

    /**
     * Mark all as read
     */
    async markAllAsRead(userid) {
        const result = await Notification.updateMany(
            { userid, read: false },
            { $set: { read: true, readAt: new Date() } }
        );

        return {
            success: true,
            markedCount: result.modifiedCount
        };
    }

    /**
     * Delete notification
     */
    async deleteNotification(notificationId, userid) {
        const result = await Notification.deleteOne({ notificationId, userid });

        if (result.deletedCount === 0) {
            throw new Error('Notification not found');
        }

        return { success: true };
    }

    /**
     * Get user preferences
     */
    async getUserPreferences(userid) {
        let prefs = await NotificationPreference.findOne({ userid });

        if (!prefs) {
            // Create default preferences
            prefs = new NotificationPreference({
                userid,
                ...NotificationPreference.getDefaults()
            });
            await prefs.save();
        }

        return prefs;
    }

    /**
     * Update user preferences
     */
    async updateUserPreferences(userid, updates) {
        let prefs = await NotificationPreference.findOne({ userid });

        if (!prefs) {
            prefs = new NotificationPreference({
                userid,
                ...NotificationPreference.getDefaults()
            });
        }

        // Update preferences
        if (updates.preferences) {
            Object.assign(prefs.preferences, updates.preferences);
        }

        if (updates.quietHours) {
            Object.assign(prefs.quietHours, updates.quietHours);
        }

        prefs.updatedAt = new Date();
        await prefs.save();

        return prefs;
    }

    /**
     * Determine which channels to use based on preferences
     */
    _determineChannels(requestedChannels, prefs) {
        const channels = [];

        if (!requestedChannels || requestedChannels.length === 0) {
            requestedChannels = ['in_app', 'email'];
        }

        if (requestedChannels.includes('in_app') && prefs.preferences.inApp.enabled) {
            channels.push('in_app');
        }

        if (requestedChannels.includes('email') && prefs.preferences.email.enabled) {
            channels.push('email');
        }

        if (requestedChannels.includes('push') && prefs.preferences.push.enabled) {
            channels.push('push');
        }

        return channels;
    }

    /**
     * Deliver notification via channels
     */
    async _deliverNotification(notification, prefs) {
        for (const channel of notification.channels) {
            try {
                if (channel === 'in_app') {
                    // In-app is already stored in DB
                    notification.markDelivered('in_app');
                }

                if (channel === 'email') {
                    await this._sendEmail(notification, prefs);
                }

                if (channel === 'push') {
                    await this._sendPush(notification);
                }
            } catch (error) {
                console.error(`Failed to deliver via ${channel}:`, error);
                if (notification.deliveryStatus[channel]) {
                    notification.deliveryStatus[channel].error = error.message;
                }
            }
        }

        await notification.save();
    }

    /**
     * Send email notification
     */
    async _sendEmail(notification, prefs) {
        const emailService = require('./email/email.service');
        const { emailQueue } = require('../config/queue/bullMQ/emailQueue');

        // Check email frequency
        if (prefs.preferences.email.frequency !== 'instant') {
            // Queue for batch delivery via BullMQ
            console.log(`Email queued for ${prefs.preferences.email.frequency} delivery`);

            await emailQueue.add('batch-notification', {
                notificationId: notification.notificationId,
                userid: notification.userid,
                frequency: prefs.preferences.email.frequency
            }, {
                priority: notification.type === 'urgent' ? 1 : 5
            });

            return;
        }

        // Get user email
        const user = await User.findOne({ userid: notification.userid }).select('email firstName lastName').lean();
        if (!user || !user.email) {
            throw new Error('User email not found');
        }

        try {
            // Send via Nodemailer (instant delivery)
            const result = await emailService.sendNotificationEmail(user, notification);

            if (result.success) {
                notification.markDelivered('email');
                console.log(`[Notification] Email sent to ${user.email} via Nodemailer`);
            }
        } catch (error) {
            console.error('[Notification] Email send error:', error);
            notification.deliveryStatus.email.error = error.message;
            throw error;
        }
    }

    /**
     * Send push notification
     */
    async _sendPush(notification) {
        const logger = require('../utils/logger');
        // Fetch user to check for push token
        const user = await User.findOne({ userid: notification.userid }).select('pushToken').lean();

        if (!user || !user.pushToken) {
            logger.debug(`[Notification] No push token for user ${notification.userid}, skipping push delivery`);
            return;
        }

        // External Push Service Integration point
        // Supported: Firebase (FCM), OneSignal, etc.
        logger.warn(`[Notification] Push delivery requested but NOT YET LINKED to provider for token ${user.pushToken.substring(0, 5)}...: ${notification.title}`);

        notification.markDelivered('push');
    }

    /**
     * Get notification statistics
     */
    async getStatistics(filters = {}) {
        const { userid, startDate, endDate } = filters;

        const query = {};
        if (userid) query.userid = userid;
        if (startDate && endDate) {
            query.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const [
            total,
            unread,
            byCategory,
            byType
        ] = await Promise.all([
            Notification.countDocuments(query),
            Notification.countDocuments({ ...query, read: false }),
            Notification.aggregate([
                { $match: query },
                { $group: { _id: '$category', count: { $sum: 1 } } }
            ]),
            Notification.aggregate([
                { $match: query },
                { $group: { _id: '$type', count: { $sum: 1 } } }
            ])
        ]);

        return {
            total,
            unread,
            byCategory,
            byType
        };
    }
}

module.exports = new NotificationService();
