const fs = require('fs');
const path = require('path');
const { sendEmail } = require('../../config/mail/nodemailer');
const emailTemplateService = require('../emailTemplate.service');

/**
 * Email Service using existing Nodemailer
 * Wrapper for notification emails
 */
class EmailService {

    async sendNotificationEmail(user, notification) {
        try {
            // Priority: Check if there's a template for this category
            const templateSlug = `${notification.category}-notification`;
            let emailContent;

            try {
                // Try fetching specific template
                emailContent = await emailTemplateService.renderTemplate(templateSlug, {
                    userName: `${user.firstName} ${user.lastName}`,
                    notificationTitle: notification.title,
                    notificationMessage: notification.message,
                    actionUrl: notification.actionUrl,
                    actionText: notification.actionText || 'View Details'
                });
            } catch (err) {
                // Fallback to legacy hardcoded HTML
                emailContent = {
                    subject: notification.title,
                    htmlBody: this._generateNotificationHTML(notification)
                };
            }

            await sendEmail(user.email, emailContent.subject, emailContent.htmlBody);

            return {
                success: true,
                to: user.email
            };
        } catch (error) {
            console.error('[EmailService] Send error:', error);
            throw error;
        }
    }

    /**
     * Send digest email
     */
    async sendDigestEmail(user, notifications, frequency) {
        try {
            const html = this._generateDigestHTML(notifications, frequency);
            const subject = `Your ${frequency} digest - ${notifications.length} notifications`;

            await sendEmail(user.email, subject, html);

            return {
                success: true,
                to: user.email
            };
        } catch (error) {
            console.error('[EmailService] Digest send error:', error);
            throw error;
        }
    }

    /**
     * Generate HTML for notification email
     */
    _generateNotificationHTML(notification) {
        const typeColors = {
            info: '#3b82f6',
            success: '#10b981',
            warning: '#f59e0b',
            error: '#ef4444',
            system: '#6366f1'
        };

        const color = typeColors[notification.type] || '#3b82f6';

        return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <div style="background-color: ${color}; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; color: #ffffff; font-size: 24px;">${notification.title}</h1>
    </div>
    
    <div style="padding: 40px 30px; background-color: #ffffff;">
        <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">
            ${notification.message}
        </p>
        
        ${notification.actionUrl ? `
        <div style="text-align: center; padding: 20px 0;">
            <a href="${notification.actionUrl}" style="display: inline-block; padding: 12px 30px; background-color: ${color}; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">
                ${notification.actionText || 'View Details'}
            </a>
        </div>
        ` : ''}
    </div>
    
    <div style="background-color: #f9fafb; padding: 20px 30px; border-top: 1px solid: #e5e7eb; border-radius: 0 0 8px 8px;">
        <p style="margin: 0; color: #6b7280; font-size: 14px; text-align: center;">
            This is an automated notification from CraftedClimate.<br>
            <a href="${process.env.APP_URL || 'https://app.craftedclimate.com'}/notifications/preferences" style="color: ${color}; text-decoration: none;">Manage notification preferences</a>
        </p>
    </div>
</div>
        `.trim();
    }

    /**
     * Generate digest HTML
     */
    _generateDigestHTML(notifications, frequency) {
        const notificationItems = notifications.map(n => {
            const typeColors = {
                info: '#3b82f6',
                success: '#10b981',
                warning: '#f59e0b',
                error: '#ef4444',
                system: '#6366f1'
            };
            const color = typeColors[n.type] || '#3b82f6';

            return `
            <div style="padding: 15px; border-left: 4px solid ${color}; margin-bottom: 15px; background-color: #f9fafb;">
                <h3 style="margin: 0 0 5px 0; color: #111827;">${n.title}</h3>
                <p style="margin: 0 0 10px 0; color: #6b7280;">${n.message}</p>
                ${n.actionUrl ? `<a href="${n.actionUrl}" style="color: ${color}; text-decoration: none;">View Details →</a>` : ''}
            </div>
            `;
        }).join('');

        return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; padding: 30px;">
    <h1 style="color: #111827;">Your ${frequency} notification digest</h1>
    <p style="color: #6b7280;">You have ${notifications.length} unread notifications:</p>
    ${notificationItems}
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="color: #6b7280; font-size: 14px; text-align: center;">
        <a href="${process.env.APP_URL || 'https://app.craftedclimate.com'}/notifications/preferences" style="color: #3b82f6; text-decoration: none;">Manage notification preferences</a>
    </p>
</div>
        `.trim();
    }
}

module.exports = new EmailService();
