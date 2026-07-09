'use strict';

const { sendEmail } = require('../../config/mail/nodemailer');

/**
 * Handle Contact Form submission
 */
async function submitContactForm(req, res, next) {
    try {
        const { name, email, subject, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({ 
                success: false, 
                message: 'Name, email, and message are required.' 
            });
        }

        const supportEmail = process.env.SUPPORT_EMAIL || 'support@craftedclimate.org';
        const emailSubject = `[Website Contact] ${subject || 'New Message'} — from ${name}`;

        const htmlBody = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #004d28 0%, #35752D 100%); padding: 24px; text-align: center; color: #fff;">
                    <h2 style="margin: 0; font-size: 20px; font-weight: 700;">New Contact Message</h2>
                    <p style="margin: 4px 0 0 0; font-size: 14px; opacity: 0.85;">Crafted Climate Public Website Enquiry</p>
                </div>
                <div style="padding: 24px; background: #ffffff;">
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                        <tr style="border-bottom: 1px solid #f3f4f6;">
                            <td style="padding: 10px 0; font-weight: bold; color: #4b5563; width: 120px;">Name:</td>
                            <td style="padding: 10px 0; color: #1f2937;">${name}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #f3f4f6;">
                            <td style="padding: 10px 0; font-weight: bold; color: #4b5563;">Email:</td>
                            <td style="padding: 10px 0; color: #1f2937;"><a href="mailto:${email}" style="color: #006838; text-decoration: none;">${email}</a></td>
                        </tr>
                        <tr style="border-bottom: 1px solid #f3f4f6;">
                            <td style="padding: 10px 0; font-weight: bold; color: #4b5563;">Subject:</td>
                            <td style="padding: 10px 0; color: #1f2937;">${subject || 'General'}</td>
                        </tr>
                    </table>
                    
                    <div style="background: #f9fafb; padding: 16px; border-radius: 8px; border: 1px solid #f3f4f6; margin-bottom: 10px;">
                        <h4 style="margin: 0 0 8px 0; color: #4b5563; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Message Content</h4>
                        <p style="margin: 0; color: #1f2937; white-space: pre-wrap; font-size: 14px;">${message}</p>
                    </div>
                </div>
                <div style="background: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af;">
                    Sent automatically by Crafted Climate API.
                </div>
            </div>
        `;

        await sendEmail(supportEmail, emailSubject, htmlBody);

        return res.status(200).json({ 
            success: true, 
            message: 'Contact form submitted and support team notified.' 
        });
    } catch (err) {
        next(err);
    }
}

/**
 * Handle Pilot Request Form submission
 */
async function submitPilotForm(req, res, next) {
    try {
        const { 
            orgName, yourName, email, phone, orgType, productOfInterest,
            location, numLocations, envConcern, currentApproach,
            intendedUse, timeline, howHeard, notes 
        } = req.body;

        if (!orgName || !yourName || !email || !productOfInterest || !location || !numLocations || !envConcern || !intendedUse || !timeline) {
            return res.status(400).json({ 
                success: false, 
                message: 'Required pilot fields are missing.' 
            });
        }

        const supportEmail = process.env.SUPPORT_EMAIL || 'support@craftedclimate.org';
        const emailSubject = `[Pilot Request] ${orgName} — ${productOfInterest}`;

        const htmlBody = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #004d28 0%, #35752D 100%); padding: 24px; text-align: center; color: #fff;">
                    <h2 style="margin: 0; font-size: 20px; font-weight: 700;">New Pilot Deployment Request</h2>
                    <p style="margin: 4px 0 0 0; font-size: 14px; opacity: 0.85;">Crafted Climate Pilot Application</p>
                </div>
                <div style="padding: 24px; background: #ffffff;">
                    <h3 style="margin-top: 0; border-bottom: 2px solid #006838; padding-bottom: 6px; color: #006838; font-size: 16px;">1. Contact & Organisation</h3>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                        <tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 6px 0; font-weight: bold; color: #4b5563; width: 180px;">Organisation:</td><td style="padding: 6px 0; color: #1f2937;">${orgName}</td></tr>
                        <tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 6px 0; font-weight: bold; color: #4b5563;">Your Name:</td><td style="padding: 6px 0; color: #1f2937;">${yourName}</td></tr>
                        <tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 6px 0; font-weight: bold; color: #4b5563;">Email Address:</td><td style="padding: 6px 0; color: #1f2937;"><a href="mailto:${email}" style="color: #006838; text-decoration: none;">${email}</a></td></tr>
                        <tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 6px 0; font-weight: bold; color: #4b5563;">Phone Number:</td><td style="padding: 6px 0; color: #1f2937;">${phone || 'N/A'}</td></tr>
                        <tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 6px 0; font-weight: bold; color: #4b5563;">Organisation Type:</td><td style="padding: 6px 0; color: #1f2937;">${orgType}</td></tr>
                        <tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 6px 0; font-weight: bold; color: #4b5563;">Product of Interest:</td><td style="padding: 6px 0; color: #1f2937;"><strong>${productOfInterest}</strong></td></tr>
                    </table>

                    <h3 style="border-bottom: 2px solid #006838; padding-bottom: 6px; color: #006838; font-size: 16px;">2. Site & Monitoring Context</h3>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                        <tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 6px 0; font-weight: bold; color: #4b5563; width: 180px;">Site Location:</td><td style="padding: 6px 0; color: #1f2937;">${location}</td></tr>
                        <tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 6px 0; font-weight: bold; color: #4b5563;">Number of Nodes:</td><td style="padding: 6px 0; color: #1f2937;">${numLocations}</td></tr>
                        <tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 6px 0; font-weight: bold; color: #4b5563;">Environmental Concern:</td><td style="padding: 6px 0; color: #1f2937;">${envConcern}</td></tr>
                    </table>

                    <div style="background: #f9fafb; padding: 12px; border-radius: 6px; border: 1px solid #f3f4f6; margin-bottom: 16px;">
                        <h4 style="margin: 0 0 6px 0; color: #4b5563; font-size: 12px; text-transform: uppercase;">Current Monitoring Approach</h4>
                        <p style="margin: 0; color: #1f2937; font-size: 13.5px;">${currentApproach || 'None specified'}</p>
                    </div>

                    <h3 style="border-bottom: 2px solid #006838; padding-bottom: 6px; color: #006838; font-size: 16px;">3. Project Goals & Logistics</h3>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                        <tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 6px 0; font-weight: bold; color: #4b5563; width: 180px;">Preferred Timeline:</td><td style="padding: 6px 0; color: #1f2937;">${timeline}</td></tr>
                        <tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 6px 0; font-weight: bold; color: #4b5563;">How they heard:</td><td style="padding: 6px 0; color: #1f2937;">${howHeard || 'N/A'}</td></tr>
                    </table>

                    <div style="background: #f9fafb; padding: 12px; border-radius: 6px; border: 1px solid #f3f4f6; margin-bottom: 16px;">
                        <h4 style="margin: 0 0 6px 0; color: #4b5563; font-size: 12px; text-transform: uppercase;">Intended Use of Data</h4>
                        <p style="margin: 0; color: #1f2937; font-size: 13.5px;">${intendedUse}</p>
                    </div>

                    ${notes ? `
                    <div style="background: #f9fafb; padding: 12px; border-radius: 6px; border: 1px solid #f3f4f6; margin-bottom: 16px;">
                        <h4 style="margin: 0 0 6px 0; color: #4b5563; font-size: 12px; text-transform: uppercase;">Additional Notes</h4>
                        <p style="margin: 0; color: #1f2937; font-size: 13.5px;">${notes}</p>
                    </div>
                    ` : ''}
                </div>
                <div style="background: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af;">
                    Sent automatically by Crafted Climate API.
                </div>
            </div>
        `;

        await sendEmail(supportEmail, emailSubject, htmlBody);

        return res.status(200).json({ 
            success: true, 
            message: 'Pilot request submitted and support team notified.' 
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    submitContactForm,
    submitPilotForm
};
