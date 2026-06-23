'use strict';

/**
 * Email Service — Notification & Digest Emails
 *
 * Replaces the old inline-HTML implementations with sendCCEmail()
 * backed by crafted_climate_email_templates.js.
 *
 * sendNotificationEmail — renders notification.generic
 * sendDigestEmail       — renders notification.digest
 */

const { sendCCEmail } = require('./craftedClimateMailer');

class EmailService {

    /**
     * Send a single notification email.
     *
     * @param {object} user         - Must have .email, .firstName, .lastName
     * @param {object} notification - { title, message, type, category, actionUrl, actionText }
     */
    async sendNotificationEmail(user, notification) {
        const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'there';

        // Map old notification.type to a CC theme
        const themeMap = {
            info:    'info',
            success: 'success',
            warning: 'warning',
            error:   'critical',
            system:  'neutral',
            alert:   'critical',
        };

        await sendCCEmail({
            type: 'notification.generic',
            to:   user.email,
            vars: {
                userName,
                recipientEmail: user.email,
                title:    notification.title,
                message:  notification.message,
                theme:    themeMap[notification.type] || 'info',
                category: notification.category || 'Notification',
                actionUrl:   notification.actionUrl,
                actionLabel: notification.actionText || 'View Details',
                transactional: true,
            },
        });

        return { success: true, to: user.email };
    }

    /**
     * Send a digest email containing multiple notifications.
     *
     * @param {object}   user          - Must have .email, .firstName, .lastName
     * @param {object[]} notifications - Array of { title, message, type, actionUrl, timestamp }
     * @param {string}   frequency     - e.g. "daily", "weekly"
     */
    async sendDigestEmail(user, notifications, frequency) {
        const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'there';

        // Map notifications to the items[] format the digest renderer expects
        const typeMap = {
            info:    'info',
            success: 'success',
            warning: 'warning',
            error:   'alert',
            system:  'neutral',
            alert:   'alert',
        };

        const items = notifications.map(n => ({
            type:      typeMap[n.type] || 'info',
            title:     n.title,
            message:   n.message,
            timestamp: n.createdAt || n.timestamp,
        }));

        await sendCCEmail({
            type: 'notification.digest',
            to:   user.email,
            vars: {
                userName,
                recipientEmail:   user.email,
                frequency,
                count:            notifications.length,
                items,
                notificationsUrl: `${process.env.APP_URL || 'https://console.craftedclimate.co'}/notifications`,
                preferencesUrl:   `${process.env.APP_URL || 'https://console.craftedclimate.co'}/notifications/preferences`,
                transactional:    false,
            },
        });

        return { success: true, to: user.email };
    }
}

module.exports = new EmailService();
