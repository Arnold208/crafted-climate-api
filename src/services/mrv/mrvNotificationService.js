'use strict';
const { mrvNotificationQueue } = require('../../config/queue/bullMQ/mrvNotificationQueue');
const MRVProject = require('../../models/mrv/project/MRVProject.model');
const MonitoringPeriod = require('../../models/mrv/monitoring/MonitoringPeriod.model');
const User = require('../../models/user/userModel');
const { generateTemplateHtml } = require('../../config/mail/templates/templateGenerator');
const { sendEmail } = require('../../config/mail/nodemailer');
const path = require('path');
const logger = require('../../utils/logger');

// Logo attachment for all MRV emails
const logoAttachment = [{
  filename: 'cc_logo_raw.png',
  path: path.join(__dirname, '../../config/storage/image/cc_logo_raw.png'),
  cid: 'cc_logo'
}];

/**
 * Send a branded MRV notification email directly (not via template DB).
 * Used for dynamic one-off notifications with inline HTML.
 */
async function sendMRVEmail({ to, subject, heading, bodyHtml, ctaText, ctaUrl }) {
  const html = generateTemplateHtml(heading, bodyHtml, ctaText, ctaUrl);
  await sendEmail(to, subject, html, logoAttachment);
}

/**
 * Resolve notification recipients for a project.
 * Returns array of { email, userId, role }
 */
async function getProjectRecipients(projectId, roles = ['mrv-project-manager', 'mrv-data-reviewer', 'mrv-methodology-manager']) {
  const project = await MRVProject.findOne({ projectId }).lean();
  if (!project) return [];

  const members = (project.members || []).filter(m => roles.includes(m.role));
  const recipients = [];

  for (const m of members) {
    const user = await User.findOne({ userid: m.userId }).lean();
    if (user?.email) {
      recipients.push({ email: user.email, userId: m.userId, role: m.role });
    }
  }
  return recipients;
}

class MRVNotificationService {

  // ── Data Gap / Sensor Offline Escalation ──────────────────────────────────

  /**
   * Schedule escalating offline alerts for a sensor within a monitoring period.
   * Chains: 1h warn → 4h alert → 24h critical → 48h escalate+block.
   * Call this when offlineAlertCron fires for a device that is in an active MRV installation.
   */
  async scheduleDataGapEscalation({ auid, projectId, monitoringPeriodId, installationId }) {
    const stages = [
      { level: 1, delayMs: 1  * 60 * 60 * 1000, tag: 'WARNING',  label: '1 hour' },
      { level: 2, delayMs: 4  * 60 * 60 * 1000, tag: 'ALERT',    label: '4 hours' },
      { level: 3, delayMs: 24 * 60 * 60 * 1000, tag: 'CRITICAL', label: '24 hours' },
      { level: 4, delayMs: 48 * 60 * 60 * 1000, tag: 'SEVERE',   label: '48 hours' },
    ];

    for (const stage of stages) {
      await mrvNotificationQueue.add(
        `data-gap:${auid}:${monitoringPeriodId}:level${stage.level}`,
        { type: 'DATA_GAP', auid, projectId, monitoringPeriodId, installationId, stage },
        { delay: stage.delayMs, jobId: `data-gap:${auid}:${monitoringPeriodId}:level${stage.level}`, removeOnComplete: true, attempts: 2 }
      );
    }
    logger.info(`[MRVNotifications] Scheduled data-gap escalation for ${auid} in period ${monitoringPeriodId}`);
  }

  /**
   * Cancel all pending data-gap escalation jobs for a device (device came back online).
   */
  async cancelDataGapEscalation({ auid, monitoringPeriodId }) {
    const stages = [1, 2, 3, 4];
    for (const level of stages) {
      const jobId = `data-gap:${auid}:${monitoringPeriodId}:level${level}`;
      try {
        const job = await mrvNotificationQueue.getJob(jobId);
        if (job) await job.remove();
      } catch (_) { /* non-fatal */ }
    }
    logger.info(`[MRVNotifications] Cancelled data-gap escalation for ${auid}`);
  }

  // ── Period Completeness Warnings ──────────────────────────────────────────

  /**
   * Evaluate period completeness and queue the appropriate notification.
   * Call this from the completeness worker after each snapshot update.
   */
  async evaluateCompleteness({ projectId, monitoringPeriodId, completenessPercent }) {
    const pct = parseFloat(completenessPercent) || 0;

    let alertLevel = null;
    if (pct < 70)       alertLevel = 'CRITICAL';
    else if (pct < 80)  alertLevel = 'ALERT';
    else if (pct < 90)  alertLevel = 'WARNING';

    if (!alertLevel) return; // ≥ 90% — no alert

    // Debounce: only one completeness alert per period per 6 hours
    const jobId = `completeness:${monitoringPeriodId}:${alertLevel}`;
    const existing = await mrvNotificationQueue.getJob(jobId);
    if (existing) return; // already queued

    await mrvNotificationQueue.add(
      jobId,
      { type: 'COMPLETENESS', projectId, monitoringPeriodId, completenessPercent: pct, alertLevel },
      { jobId, delay: 0, removeOnComplete: true, attempts: 2 }
    );
  }

  // ── Quarantine Notification (debounced) ───────────────────────────────────

  /**
   * Notify data manager when observations are quarantined.
   * Multiple quarantine events within 1 hour are batched into one email.
   */
  async notifyQuarantine({ observationId, projectId, monitoringPeriodId, reason }) {
    const jobId = `quarantine-digest:${monitoringPeriodId}:${new Date().toISOString().slice(0, 13)}`; // hour bucket
    const existing = await mrvNotificationQueue.getJob(jobId);

    if (existing) {
      // Append to existing digest job's data
      const data = existing.data;
      data.observations = data.observations || [];
      data.observations.push({ observationId, reason });
      await existing.updateData(data);
    } else {
      await mrvNotificationQueue.add(
        jobId,
        { type: 'QUARANTINE_DIGEST', projectId, monitoringPeriodId, observations: [{ observationId, reason }] },
        { jobId, delay: 60 * 60 * 1000, removeOnComplete: true, attempts: 2 } // send 1h after first event
      );
    }
  }

  // ── Verification Deadline Reminders ───────────────────────────────────────

  /**
   * Schedule 30/7/1 day reminders for a verification case deadline.
   */
  async scheduleVerificationReminders({ verificationCaseId, projectId, deadlineDate, vvbEmail, projectOwnerEmail }) {
    const deadline = new Date(deadlineDate);
    const now = Date.now();
    const reminders = [
      { days: 30, tag: 'REMINDER_30D' },
      { days: 7,  tag: 'REMINDER_7D'  },
      { days: 1,  tag: 'REMINDER_1D'  },
    ];

    for (const r of reminders) {
      const fireAt = deadline.getTime() - r.days * 24 * 60 * 60 * 1000;
      if (fireAt <= now) continue; // already past
      const delay = fireAt - now;
      const jobId = `vvb-reminder:${verificationCaseId}:${r.tag}`;
      await mrvNotificationQueue.add(
        jobId,
        { type: 'VVB_DEADLINE_REMINDER', verificationCaseId, projectId, deadlineDate, vvbEmail, projectOwnerEmail, tag: r.tag, daysLeft: r.days },
        { jobId, delay, removeOnComplete: true, attempts: 2 }
      );
    }
    logger.info(`[MRVNotifications] Scheduled verification reminders for case ${verificationCaseId}`);
  }

  // ── Direct send helpers (called by the worker) ────────────────────────────

  async sendDataGapAlert({ auid, projectId, monitoringPeriodId, stage }) {
    const recipients = await getProjectRecipients(projectId, ['mrv-project-manager', 'mrv-field-officer', 'mrv-data-reviewer']);
    if (!recipients.length) return;

    const period = await MonitoringPeriod.findOne({ monitoringPeriodId }).lean();
    const periodName = period?.name || monitoringPeriodId;

    const bodyHtml = `
      <p>Sensor <strong>${auid}</strong> has been offline for <strong>${stage.label}</strong> during active monitoring period <strong>${periodName}</strong>.</p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Device</span><span class="info-value">${auid}</span></div>
        <div class="info-row"><span class="info-label">Monitoring Period</span><span class="info-value">${periodName}</span></div>
        <div class="info-row"><span class="info-label">Duration Offline</span><span class="info-value">${stage.label}</span></div>
        <div class="info-row"><span class="info-label">Severity</span><span class="info-value">${stage.tag}</span></div>
      </div>
      <p>Data gaps during an active monitoring period may reduce completeness and affect carbon credit calculations. Please restore the device as soon as possible.</p>
    `;

    const subject = stage.level >= 3
      ? `Critical: Sensor ${auid} offline ${stage.label} — data gap forming`
      : `MRV Alert: Sensor ${auid} offline for ${stage.label}`;

    for (const r of recipients) {
      await sendMRVEmail({
        to: r.email,
        subject,
        heading: `Sensor Data Gap — ${stage.tag}`,
        bodyHtml,
        ctaText: 'View Project',
        ctaUrl: `${process.env.APP_URL || 'https://console.craftedclimate.co'}/mrv/projects/${projectId}`
      });
    }
  }

  async sendCompletenessAlert({ projectId, monitoringPeriodId, completenessPercent, alertLevel }) {
    const recipients = await getProjectRecipients(projectId);
    if (!recipients.length) return;

    const period = await MonitoringPeriod.findOne({ monitoringPeriodId }).lean();
    const periodName = period?.name || monitoringPeriodId;

    const bodyHtml = `
      <p>The completeness of monitoring period <strong>${periodName}</strong> has dropped to <strong>${completenessPercent.toFixed(1)}%</strong>.</p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Monitoring Period</span><span class="info-value">${periodName}</span></div>
        <div class="info-row"><span class="info-label">Current Completeness</span><span class="info-value">${completenessPercent.toFixed(1)}%</span></div>
        <div class="info-row"><span class="info-label">Target</span><span class="info-value">90%</span></div>
        <div class="info-row"><span class="info-label">Status</span><span class="info-value">${alertLevel}</span></div>
      </div>
      ${completenessPercent < 70 ? '<p><strong>At this level, carbon credit calculation may be blocked.</strong> Immediate attention is required.</p>' : '<p>Please review sensor connectivity and data gaps to improve coverage before the period closes.</p>'}
    `;

    const subject = completenessPercent < 70
      ? `Critical: Monitoring period completeness at ${completenessPercent.toFixed(1)}% — calculation at risk`
      : `MRV Notice: Period completeness at ${completenessPercent.toFixed(1)}%`;

    for (const r of recipients) {
      await sendMRVEmail({
        to: r.email,
        subject,
        heading: 'Monitoring Period Completeness',
        bodyHtml,
        ctaText: 'View Period',
        ctaUrl: `${process.env.APP_URL || 'https://console.craftedclimate.co'}/mrv/projects/${projectId}/periods/${monitoringPeriodId}`
      });
    }
  }

  async sendQuarantineDigest({ projectId, monitoringPeriodId, observations }) {
    const recipients = await getProjectRecipients(projectId, ['mrv-data-reviewer', 'mrv-project-manager']);
    if (!recipients.length) return;

    const period = await MonitoringPeriod.findOne({ monitoringPeriodId }).lean();
    const periodName = period?.name || monitoringPeriodId;

    const rows = observations.map(o =>
      `<div class="info-row"><span class="info-label">${o.observationId}</span><span class="info-value">${o.reason || 'See data quality dashboard'}</span></div>`
    ).join('');

    const bodyHtml = `
      <p><strong>${observations.length}</strong> observation(s) were quarantined in period <strong>${periodName}</strong> and require review.</p>
      <div class="info-box">${rows}</div>
      <p>Please review and either approve or void each observation in the data quality dashboard.</p>
    `;

    for (const r of recipients) {
      await sendMRVEmail({
        to: r.email,
        subject: `${observations.length} observation(s) quarantined — review required`,
        heading: 'Quarantined Observations',
        bodyHtml,
        ctaText: 'Open Data Quality Dashboard',
        ctaUrl: `${process.env.APP_URL || 'https://console.craftedclimate.co'}/mrv/projects/${projectId}/data-quality`
      });
    }
  }

  async sendVerificationReminder({ verificationCaseId, projectId, deadlineDate, vvbEmail, projectOwnerEmail, daysLeft }) {
    const project = await MRVProject.findOne({ projectId }).lean();
    const projectName = project?.name || projectId;
    const deadlineStr = new Date(deadlineDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    const bodyHtml = `
      <p>The verification deadline for project <strong>${projectName}</strong> is <strong>${deadlineStr}</strong> — <strong>${daysLeft} day(s)</strong> remaining.</p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Project</span><span class="info-value">${projectName}</span></div>
        <div class="info-row"><span class="info-label">Verification Case</span><span class="info-value">${verificationCaseId}</span></div>
        <div class="info-row"><span class="info-label">Deadline</span><span class="info-value">${deadlineStr}</span></div>
        <div class="info-row"><span class="info-label">Days Remaining</span><span class="info-value">${daysLeft}</span></div>
      </div>
      <p>Please ensure all documentation, evidence files, and calculation results are finalised before the deadline.</p>
    `;

    const subject = `Verification deadline in ${daysLeft} day(s) — ${projectName}`;
    const heading = 'Verification Deadline Reminder';
    const ctaText = 'View Verification Case';
    const ctaUrl  = `${process.env.APP_URL || 'https://console.craftedclimate.co'}/mrv/projects/${projectId}/verification/${verificationCaseId}`;

    const toList = [vvbEmail, projectOwnerEmail].filter(Boolean);
    for (const to of toList) {
      await sendMRVEmail({ to, subject, heading, bodyHtml, ctaText, ctaUrl });
    }
  }
}

module.exports = new MRVNotificationService();
