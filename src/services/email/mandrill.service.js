const mandrill = require('@mailchimp/mailchimp_transactional')(process.env.MANDRILL_API_KEY);

/**
 * Mandrill Email Service
 * Wrapper for Mailchimp Transactional Email (Mandrill)
 */
class MandrillEmailService {

    /**
     * Send single email
     */
    async sendEmail({ to, subject, html, text, from, replyTo, tags }) {
        try {
            const message = {
                from_email: from || process.env.EMAIL_FROM || 'noreply@craftedclimate.com',
                from_name: process.env.EMAIL_FROM_NAME || 'CraftedClimate',
                to: [
                    {
                        email: to,
                        type: 'to'
                    }
                ],
                subject,
                html,
                text,
                tags: tags || ['notification'],
                track_opens: true,
                track_clicks: true,
                auto_text: !text, // Auto-generate text from HTML if not provided
                inline_css: true
            };

            if (replyTo) {
                message.headers = {
                    'Reply-To': replyTo
                };
            }

            const response = await mandrill.messages.send({
                message
            });

            console.log('[Mandrill] Email sent:', response[0]);

            return {
                success: true,
                messageId: response[0]._id,
                status: response[0].status,
                rejectReason: response[0].reject_reason
            };
        } catch (error) {
            console.error('[Mandrill] Send error:', error);
            throw new Error(`Mandrill send failed: ${error.message}`);
        }
    }

    /**
     * Send notification email
     */
    async sendNotificationEmail(user, notification) {
        const html = this._generateNotificationHTML(notification);
        const text = this._generateNotificationText(notification);

        return this.sendEmail({
            to: user.email,
            subject: notification.title,
            html,
            text,
            tags: ['notification', notification.category, notification.type]
        });
    }

    /**
     * Send batch emails
     */
    async sendBatch(emails) {
        try {
            const messages = emails.map(email => ({
                from_email: email.from || process.env.EMAIL_FROM || 'noreply@craftedclimate.com',
                from_name: process.env.EMAIL_FROM_NAME || 'CraftedClimate',
                to: [{ email: email.to, type: 'to' }],
                subject: email.subject,
                html: email.html,
                text: email.text,
                tags: email.tags || ['notification'],
                track_opens: true,
                track_clicks: true,
                auto_text: !email.text,
                inline_css: true
            }));

            const response = await mandrill.messages.sendBatch({
                messages
            });

            console.log(`[Mandrill] Batch sent: ${response.length} emails`);

            return response.map(r => ({
                email: r.email,
                status: r.status,
                messageId: r._id,
                rejectReason: r.reject_reason
            }));
        } catch (error) {
            console.error('[Mandrill] Batch send error:', error);
            throw new Error(`Mandrill batch send failed: ${error.message}`);
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
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${notification.title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: ${color}; padding: 30px; text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 24px;">${notification.title}</h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                                ${notification.message}
                            </p>
                            
                            ${notification.actionUrl ? `
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center" style="padding: 20px 0;">
                                        <a href="${notification.actionUrl}" style="display: inline-block; padding: 12px 30px; background-color: ${color}; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">
                                            ${notification.actionText || 'View Details'}
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            ` : ''}
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f9fafb; padding: 20px 30px; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0; color: #6b7280; font-size: 14px; text-align: center;">
                                This is an automated notification from CraftedClimate.<br>
                                <a href="${process.env.APP_URL}/notifications/preferences" style="color: ${color}; text-decoration: none;">Manage notification preferences</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        `.trim();
    }

    /**
     * Generate plain text for notification email
     */
    _generateNotificationText(notification) {
        let text = `${notification.title}\n\n`;
        text += `${notification.message}\n\n`;

        if (notification.actionUrl) {
            text += `${notification.actionText || 'View Details'}: ${notification.actionUrl}\n\n`;
        }

        text += `---\n`;
        text += `This is an automated notification from CraftedClimate.\n`;
        text += `Manage preferences: ${process.env.APP_URL}/notifications/preferences`;

        return text;
    }

    /**
     * Get sending statistics
     */
    async getStats() {
        try {
            const response = await mandrill.users.info();
            return {
                reputation: response.reputation,
                hourlyQuota: response.hourly_quota,
                backlog: response.backlog
            };
        } catch (error) {
            console.error('[Mandrill] Stats error:', error);
            return null;
        }
    }
}

module.exports = new MandrillEmailService();
