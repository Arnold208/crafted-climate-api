const { sendEmail } = require('./nodemailer');
const email = 'kimkpes@gmail.com';
const subject = 'Welcome to Crafted Climate!';
const content = `
    <p>Dear User,</p>
    <p>We are excited to invite you to join <strong>CraftedClimate</strong>, your go-to platform for climate monitoring and analytics.</p>
    <p><a href="https://craftedclimate.org/welcome" target="_blank">Get Started</a></p>
    <p>Thank you for joining us!</p>
`;

sendEmail(email, subject, content)
  .then(() => console.log('Email sent successfully.'))
  .catch(err => console.error('Failed to send email:', err));
