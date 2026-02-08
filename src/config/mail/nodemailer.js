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

dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });

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

async function sendEmail(to, subject, htmlBody, attachments = []) {
    try {
        const mailOptions = {
            from: process.env.SENDER,
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

module.exports = { sendEmail };
