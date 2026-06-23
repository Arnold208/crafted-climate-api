const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

let envFile;

if (process.env.NODE_ENV === 'development') {
    envFile = '.env.development';
} else {
    envFile = '.env';   // default for production or if NODE_ENV not set
}

dotenv.config({ path: path.resolve(__dirname, `../../../${envFile}`) });

const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT) || 587,
    secure: false,
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD,
    },
    tls: {
        rejectUnauthorized: false,
        minVersion: "TLSv1.2"
    },
    logger: false,
    debug: false
});

/**
 * Send a pre-built Nodemailer payload.
 * Used by craftedClimateMailer — accepts the full object returned by
 * createEmailPayload() from crafted_climate_email_templates.js (including
 * CID logo attachment and all headers).
 */
async function sendPayload(payload) {
    try {
        const info = await transporter.sendMail(payload);
        // console.log('✅ Email sent:', info.messageId);
        return info;
    } catch (error) {
        console.error('❌ Error sending email payload:', error);
        throw error;
    }
}

/**
 * Legacy helper — kept for backward compatibility.
 * Prefer sendPayload() / craftedClimateMailer for new code.
 */
async function sendEmail(to, subject, htmlBody, attachments = []) {
    try {
        const mailOptions = {
            from: process.env.EMAIL_FROM_NAME ? `"${process.env.EMAIL_FROM_NAME}" <${process.env.SENDER || process.env.EMAIL_FROM_ADDRESS}>` : (process.env.SENDER || '"Crafted Climate" <noreply@craftedclimate.org>'),
            to,
            subject,
            html: htmlBody,
            attachments: attachments
        };

        const info = await transporter.sendMail(mailOptions);
        // console.log('✅ Email sent:', info.messageId);
    } catch (error) {
        console.error('❌ Error sending email:', error);
        throw error; // Re-throw to let caller handle it
    }
}

module.exports = { sendEmail, sendPayload, transporter };

