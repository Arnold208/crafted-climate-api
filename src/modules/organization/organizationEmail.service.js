'use strict';

/**
 * Organization Email Service
 *
 * All emails now rendered by craftedClimateMailer (crafted_climate_email_templates.js):
 * table-layout HTML, CID logo, severity themes, auto plain-text, and
 * the Crafted Climate branded footer.
 *
 * Method signatures are unchanged so existing callers need no edits.
 */

const { sendCCEmail } = require('../../services/email/craftedClimateMailer');

class OrganizationEmailService {

    /** Business verification submitted */
    async sendVerificationSubmitted(organizationName, adminEmail, opts = {}) {
        await sendCCEmail({
            type: 'org.verificationSubmitted',
            to: adminEmail,
            vars: {
                orgName:  organizationName,
                userName: opts.userName,
                actionUrl: opts.actionUrl,
                referenceId: opts.referenceId,
                submittedAt: opts.submittedAt || new Date().toISOString(),
            },
        });
    }

    /** Business verification approved */
    async sendVerificationApproved(organizationName, adminEmail, opts = {}) {
        await sendCCEmail({
            type: 'org.verificationApproved',
            to: adminEmail,
            vars: {
                orgName:   organizationName,
                userName:  opts.userName,
                actionUrl: opts.actionUrl || process.env.APP_URL,
                reviewedAt: opts.reviewedAt || new Date().toISOString(),
            },
        });
    }

    /** Business verification rejected */
    async sendVerificationRejected(organizationName, adminEmail, reason, opts = {}) {
        await sendCCEmail({
            type: 'org.verificationRejected',
            to: adminEmail,
            vars: {
                orgName:  organizationName,
                userName: opts.userName,
                reason,
                actionUrl: opts.actionUrl,
            },
        });
    }

    /** Partner application submitted */
    async sendPartnerApplicationSubmitted(organizationName, adminEmail, tier, opts = {}) {
        await sendCCEmail({
            type: 'org.partnerSubmitted',
            to: adminEmail,
            vars: {
                orgName:       organizationName,
                userName:      opts.userName,
                requestedType: tier,
                submittedAt:   opts.submittedAt || new Date().toISOString(),
            },
        });
    }

    /** Partner application approved */
    async sendPartnerApplicationApproved(organizationName, adminEmail, tier, benefits, opts = {}) {
        // Build a human-readable summary of benefits for the notice block
        const benefitLines = [];
        if (benefits) {
            if (benefits.discountPercentage) benefitLines.push(`${benefits.discountPercentage}% discount on all subscriptions`);
            if (benefits.freeDevices)        benefitLines.push(`${benefits.freeDevices} free devices`);
            if (benefits.apiRateLimitMultiplier) benefitLines.push(`${benefits.apiRateLimitMultiplier}x API rate limit`);
            if (benefits.prioritySupport)    benefitLines.push('Priority support');
            if (benefits.dedicatedAccountManager) benefitLines.push('Dedicated account manager');
            if (benefits.customBranding)     benefitLines.push('Custom branding');
        }

        await sendCCEmail({
            type: 'org.partnerApproved',
            to: adminEmail,
            vars: {
                orgName:   organizationName,
                userName:  opts.userName,
                newType:   tier,
                actionUrl: opts.actionUrl || process.env.APP_URL,
                // Pass benefits as a notice via generic metaRows
                metaRows: benefitLines.length ? [{ label: 'Partner benefits', value: benefitLines.join(' · ') }] : [],
            },
        });
    }

    /** Partner application rejected */
    async sendPartnerApplicationRejected(organizationName, adminEmail, reason, opts = {}) {
        await sendCCEmail({
            type: 'org.partnerRejected',
            to: adminEmail,
            vars: {
                orgName:  organizationName,
                userName: opts.userName,
                reason,
            },
        });
    }

    /** Partner status revoked */
    async sendPartnerStatusRevoked(organizationName, adminEmail, reason, opts = {}) {
        await sendCCEmail({
            type: 'org.partnerRevoked',
            to: adminEmail,
            vars: {
                orgName:  organizationName,
                userName: opts.userName,
                reason,
            },
        });
    }

    /** Organization type change submitted */
    async sendTypeChangeRequestSubmitted(organizationName, adminEmail, requestedType, opts = {}) {
        await sendCCEmail({
            type: 'org.typeChangeSubmitted',
            to: adminEmail,
            vars: {
                orgName:       organizationName,
                userName:      opts.userName,
                requestedType,
                submittedAt:   opts.submittedAt || new Date().toISOString(),
            },
        });
    }

    /** Organization type change approved */
    async sendTypeChangeApproved(organizationName, adminEmail, newType, automaticBenefits, opts = {}) {
        await sendCCEmail({
            type: 'org.typeChangeApproved',
            to: adminEmail,
            vars: {
                orgName:   organizationName,
                userName:  opts.userName,
                newType,
                actionUrl: opts.actionUrl || process.env.APP_URL,
            },
        });
    }

    /** Organization type change rejected */
    async sendTypeChangeRejected(organizationName, adminEmail, reason, opts = {}) {
        await sendCCEmail({
            type: 'org.typeChangeRejected',
            to: adminEmail,
            vars: {
                orgName:  organizationName,
                userName: opts.userName,
                reason,
            },
        });
    }

    /** Organization creation approved */
    async sendOrganizationApproved(userEmail, organizationName, opts = {}) {
        await sendCCEmail({
            type: 'org.creationApproved',
            to: userEmail,
            vars: {
                orgName:   organizationName,
                userName:  opts.userName,
                actionUrl: opts.actionUrl || process.env.APP_URL,
            },
        });
    }

    /** Organization creation rejected */
    async sendOrganizationRejected(userEmail, organizationName, reason, opts = {}) {
        await sendCCEmail({
            type: 'org.creationRejected',
            to: userEmail,
            vars: {
                orgName:  organizationName,
                userName: opts.userName,
                reason,
            },
        });
    }

    /**
     * Send member invitation email.
     *
     * Signature matches original: sendInvitation(email, orgName, acceptUrl, signupUrl, isNewUser)
     */
    async sendInvitation(email, organizationName, acceptUrl, signupUrl, isNewUser, opts = {}) {
        await sendCCEmail({
            type: 'org.invitation',
            to: email,
            vars: {
                orgName:        organizationName,
                inviteeName:    opts.inviteeName,
                inviterName:    opts.inviterName,
                role:           opts.role,
                acceptUrl,
                signupUrl,
                isNewUser:      !!isNewUser,
                invitationMode: isNewUser ? 'new_user' : 'existing_user',
                expiresAt:      opts.expiresAt,
            },
        });
    }
}

module.exports = new OrganizationEmailService();
