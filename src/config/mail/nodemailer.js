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

async function sendEmail(to, subject, emailBody) {
    const templatePath = path.join(__dirname, 'html/emailTemplate.html');
    let htmlTemplate = fs.readFileSync(templatePath, 'utf-8');

    htmlTemplate = htmlTemplate.replace('{{emailBody}}', emailBody);
    htmlTemplate = htmlTemplate.replace('{{logoUrl}}', 'cid:logo');

    const logoPath = path.join(__dirname, 'logo/splash.png');

    try {
        const info = await transporter.sendMail({
            from: process.env.SENDER,
            to,
            subject,
            html: htmlTemplate,
            attachments: [
                {
                    filename: 'logo.png',
                    path: logoPath,
                    cid: 'logo'
                }
            ]
        });

        // console.log('✅ Email sent:', info.messageId);
        // console.log('📦 SMTP response:', info.response);
    } catch (error) {
        console.error('❌ Error sending email:', error);
    }
}

module.exports = { sendEmail };
