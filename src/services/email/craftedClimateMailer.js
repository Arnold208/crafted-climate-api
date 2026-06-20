'use strict';

/**
 * Crafted Climate — Unified Email Sender
 *
 * Single entry point for ALL transactional emails in the platform.
 *
 * Usage:
 *   const { sendCCEmail } = require('./craftedClimateMailer');
 *
 *   await sendCCEmail({
 *     type: 'auth.otp',
 *     to:   'user@example.com',
 *     vars: { otp: '482913', expiresIn: '15 minutes' },
 *   });
 *
 * Supported types (from crafted_climate_email_templates.js):
 *
 *   AUTH:
 *     auth.otp              — vars: otp, expiresIn, context, userName
 *     auth.welcomeGoogle    — vars: userName, dashboardUrl
 *     auth.welcomeDb        — vars: userName, dashboardUrl
 *     auth.backofficeMfa    — vars: otp, expiresIn
 *
 *   ADMIN:
 *     admin.passwordResetRequest  — vars: requestingAdminName, requestedAt, ipAddress, requestId, reviewUrl
 *     admin.passwordResetApproved — vars: userName, resetUrl, expiresAt
 *     admin.forceUserPasswordReset — vars: userName, resetUrl, reason, expiresAt
 *
 *   ALERTS:
 *     alert.deviceOfflineWarning  — vars: nickname, devid, lastSeen, durationFormatted, location, batchHealth, dashboardUrl
 *     alert.deviceOfflineCritical — same + deviceModel
 *     alert.deviceOfflineSevere   — same
 *
 *   NOTIFICATIONS:
 *     notification.generic  — vars: title, message, theme, actionUrl, actionLabel, metaRows
 *     notification.digest   — vars: items[], frequency, count, notificationsUrl
 *
 *   ORGANIZATION:
 *     org.verificationSubmitted  — vars: orgName, userName
 *     org.verificationApproved   — vars: orgName, userName, actionUrl
 *     org.verificationRejected   — vars: orgName, userName, reason
 *     org.partnerSubmitted       — vars: orgName, userName
 *     org.partnerApproved        — vars: orgName, userName, actionUrl
 *     org.partnerRejected        — vars: orgName, userName, reason
 *     org.partnerRevoked         — vars: orgName, userName, reason
 *     org.typeChangeSubmitted    — vars: orgName, userName, requestedType
 *     org.typeChangeApproved     — vars: orgName, userName, newType
 *     org.typeChangeRejected     — vars: orgName, userName, reason
 *     org.creationApproved       — vars: orgName, userName, actionUrl
 *     org.creationRejected       — vars: orgName, userName, reason
 *     org.invitation             — vars: orgName, inviteeName, inviterName, role, acceptUrl, signupUrl,
 *                                         isNewUser, expiresAt
 *
 *   COLLABORATION:
 *     collaboration.deviceAdded — vars: devName, devid, role, location, addedBy, collaboratorName,
 *                                        permissions[], deviceUrl
 *
 *   SUBSCRIPTION:
 *     subscription.expiry3      — vars: userName, planName, expiryDate, renewalUrl
 *     subscription.expiry2      — same
 *     subscription.expiry1      — same
 *     subscription.graceStarted — vars: userName, planName, graceEndsAt, renewalUrl
 *     subscription.grace2       — same
 *     subscription.grace1       — same
 *     subscription.downgraded   — vars: userName, planName, downgradeSummary, renewalUrl
 */

const path = require('path');
const { createEmailPayload } = require('../../../crafted_climate_email_templates');
const { sendPayload } = require('../../config/mail/nodemailer');

/**
 * Send a Crafted Climate branded email.
 *
 * @param {object}  options
 * @param {string}  options.type   - Email type (e.g. 'auth.otp', 'org.invitation')
 * @param {string|string[]} options.to - Recipient email address(es)
 * @param {object}  [options.vars] - Template variables
 * @param {string}  [options.replyTo] - Optional reply-to address
 * @returns {Promise<void>}
 */
async function sendCCEmail({ type, to, vars = {}, replyTo } = {}) {
    const payload = createEmailPayload({ type, to, vars, replyTo });
    await sendPayload(payload);
}

/**
 * Fire-and-forget version — swallows errors and logs them.
 * Use for non-critical emails (welcome, digest) where failure must not
 * interrupt the main request.
 */
async function sendCCEmailSafe({ type, to, vars = {}, replyTo } = {}) {
    try {
        await sendCCEmail({ type, to, vars, replyTo });
    } catch (err) {
        console.error(`[CCMailer] Failed to send "${type}" to "${to}":`, err.message);
    }
}

module.exports = { sendCCEmail, sendCCEmailSafe };
