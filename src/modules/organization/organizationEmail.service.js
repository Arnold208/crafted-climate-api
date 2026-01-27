/**
 * Email Notification Service for Organization Management
 * Sends emails for verification, partner applications, and type changes
 * 
 * Uses existing sendEmail service from config/mail/nodemailer
 */

const { sendEmail } = require('../../config/mail/nodemailer');

class OrganizationEmailService {

    /**
     * Send verification submission confirmation
     */
    async sendVerificationSubmitted(organizationName, adminEmail) {
        const subject = `Business Verification Submitted - ${organizationName}`;
        const body = `
            <h2>Business Verification Submitted</h2>
            <p>Your business verification for <strong>${organizationName}</strong> has been submitted successfully.</p>
            <p>Our team will review your documents and respond within 3-5 business days.</p>
            <p>You will receive an email once the review is complete.</p>
            <br>
            <p>Thank you for choosing Crafted Climate!</p>
        `;

        await sendEmail(adminEmail, subject, body);
    }

    /**
     * Send verification approved notification
     */
    async sendVerificationApproved(organizationName, adminEmail) {
        const subject = `Business Verification Approved - ${organizationName}`;
        const body = `
            <h2>Business Verification Approved</h2>
            <p>Congratulations! Your business verification for <strong>${organizationName}</strong> has been approved.</p>
            <p>Your organization now has access to verified business features.</p>
            <br>
            <p>Thank you for being a valued partner!</p>
        `;

        await sendEmail(adminEmail, subject, body);
    }

    /**
     * Send verification rejected notification
     */
    async sendVerificationRejected(organizationName, adminEmail, reason) {
        const subject = `Business Verification Update - ${organizationName}`;
        const body = `
            <h2>Business Verification Review Complete</h2>
            <p>Thank you for submitting your business verification for <strong>${organizationName}</strong>.</p>
            <p>Unfortunately, we were unable to approve your verification at this time.</p>
            <p><strong>Reason:</strong> ${reason}</p>
            <p>You may resubmit your verification with updated documents.</p>
            <br>
            <p>If you have questions, please contact our support team.</p>
        `;

        await sendEmail(adminEmail, subject, body);
    }

    /**
     * Send partner application submitted confirmation
     */
    async sendPartnerApplicationSubmitted(organizationName, adminEmail, tier) {
        const subject = `Partner Application Submitted - ${organizationName}`;
        const body = `
            <h2>Partner Application Submitted</h2>
            <p>Your application for <strong>${tier}</strong> partner status has been submitted successfully.</p>
            <p>Organization: <strong>${organizationName}</strong></p>
            <p>Our team will review your application and respond within 5-7 business days.</p>
            <br>
            <p>Thank you for your interest in partnering with Crafted Climate!</p>
        `;

        await sendEmail(adminEmail, subject, body);
    }

    /**
     * Send partner application approved notification
     */
    async sendPartnerApplicationApproved(organizationName, adminEmail, tier, benefits) {
        const subject = `Partner Application Approved - ${organizationName}`;
        const body = `
            <h2>Welcome to the Crafted Climate Partner Program!</h2>
            <p>Congratulations! Your application for <strong>${tier}</strong> partner status has been approved.</p>
            <p>Organization: <strong>${organizationName}</strong></p>
            <br>
            <h3>Your Partner Benefits:</h3>
            <ul>
                <li><strong>${benefits.discountPercentage}% discount</strong> on all subscriptions</li>
                <li><strong>${benefits.freeDevices} free devices</strong></li>
                <li><strong>${benefits.apiRateLimitMultiplier}x API rate limit</strong></li>
                ${benefits.prioritySupport ? '<li><strong>Priority support</strong></li>' : ''}
                ${benefits.dedicatedAccountManager ? '<li><strong>Dedicated account manager</strong></li>' : ''}
                ${benefits.customBranding ? '<li><strong>Custom branding</strong></li>' : ''}
            </ul>
            <br>
            <p>Your benefits are now active and will be applied automatically.</p>
            <p>Thank you for partnering with us!</p>
        `;

        await sendEmail(adminEmail, subject, body);
    }

    /**
     * Send partner application rejected notification
     */
    async sendPartnerApplicationRejected(organizationName, adminEmail, reason) {
        const subject = `Partner Application Update - ${organizationName}`;
        const body = `
            <h2>Partner Application Review Complete</h2>
            <p>Thank you for your interest in the Crafted Climate Partner Program.</p>
            <p>Organization: <strong>${organizationName}</strong></p>
            <p>After careful review, we are unable to approve your partner application at this time.</p>
            <p><strong>Reason:</strong> ${reason}</p>
            <p>You may reapply in the future as your organization grows.</p>
            <br>
            <p>If you have questions, please contact our partnerships team.</p>
        `;

        await sendEmail(adminEmail, subject, body);
    }

    /**
     * Send type change request submitted confirmation
     */
    async sendTypeChangeRequestSubmitted(organizationName, adminEmail, requestedType) {
        const subject = `Organization Type Change Request - ${organizationName}`;
        const body = `
            <h2>Type Change Request Submitted</h2>
            <p>Your request to change the organization type to <strong>${requestedType}</strong> has been submitted.</p>
            <p>Organization: <strong>${organizationName}</strong></p>
            <p>Our team will review your request and supporting documents within 3-5 business days.</p>
            <br>
            <p>You will receive an email once the review is complete.</p>
        `;

        await sendEmail(adminEmail, subject, body);
    }

    /**
     * Send type change approved notification
     */
    async sendTypeChangeApproved(organizationName, adminEmail, newType, automaticBenefits) {
        const subject = `Type Change Approved - ${organizationName}`;
        const body = `
            <h2>Organization Type Change Approved</h2>
            <p>Your request to change the organization type has been approved.</p>
            <p>Organization: <strong>${organizationName}</strong></p>
            <p>New Type: <strong>${newType}</strong></p>
            ${automaticBenefits ? '<p><strong>Automatic 15% non-profit discount applied!</strong></p>' : ''}
            <br>
            <p>Your organization type has been updated successfully.</p>
        `;

        await sendEmail(adminEmail, subject, body);
    }

    /**
     * Send type change rejected notification
     */
    async sendTypeChangeRejected(organizationName, adminEmail, reason) {
        const subject = `Type Change Request Update - ${organizationName}`;
        const body = `
            <h2>Type Change Request Review Complete</h2>
            <p>Thank you for submitting your organization type change request.</p>
            <p>Organization: <strong>${organizationName}</strong></p>
            <p>After reviewing your request and supporting documents, we are unable to approve the change at this time.</p>
            <p><strong>Reason:</strong> ${reason}</p>
            <p>You may submit a new request with additional documentation if needed.</p>
            <br>
            <p>If you have questions, please contact our support team.</p>
        `;

        await sendEmail(adminEmail, subject, body);
    }

    /**
     * Send partner status revoked notification
     */
    async sendPartnerStatusRevoked(organizationName, adminEmail, reason) {
        const subject = `Partner Status Update - ${organizationName}`;
        const body = `
            <h2>Partner Status Update</h2>
            <p>This is to inform you that your partner status for <strong>${organizationName}</strong> has been revoked.</p>
            <p><strong>Reason:</strong> ${reason}</p>
            <p>Your organization will continue to operate normally, but partner benefits will no longer apply.</p>
            <br>
            <p>If you believe this was done in error or have questions, please contact our partnerships team.</p>
        `;

        await sendEmail(adminEmail, subject, body);
    }
}

module.exports = new OrganizationEmailService();
