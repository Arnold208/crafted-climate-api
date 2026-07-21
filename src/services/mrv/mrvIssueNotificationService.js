'use strict';

const Notification = require('../../models/notification/Notification');
const { v4: uuidv4 } = require('uuid');

const CHECK_ROUTE = {
  methodology_assignment: 'methodology',
  standard_version: 'methodology',
  country_eligibility: 'methodology',
  activity_type: 'methodology',
  sensor_capability: 'installations',
  active_installations: 'installations',
  calibration_records: 'calibrations',
  applicability: 'methodology',
  no_open_period: 'monitoring-periods',
  field_team_member: 'team',
};

function notificationType(severity) {
  return severity === 'BLOCKER' ? 'error' : severity === 'WARNING' ? 'warning' : 'info';
}

function actionUrl(projectId, check) {
  const section = CHECK_ROUTE[check] || 'readiness';
  return `/mrv/projects/${projectId}/${section}`;
}

async function upsertProjectIssueNotifications({ project, source, checks = [] }) {
  if (!project?.projectId || !Array.isArray(project.members)) return;
  const issueChecks = checks.filter((check) => !check.passed && ['BLOCKER', 'WARNING'].includes(check.severity));
  if (!issueChecks.length) return;

  const members = project.members.map((member) => member.userId).filter(Boolean);
  if (!members.length) return;

  const now = new Date();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  for (const check of issueChecks) {
    const route = actionUrl(project.projectId, check.check);
    const title = check.severity === 'BLOCKER'
      ? `MRV blocker: ${project.name || project.projectId}`
      : `MRV warning: ${project.name || project.projectId}`;
    const message = check.message || 'An MRV project item requires review.';
    const metadata = {
      source: String(source || 'mrv'),
      projectId: String(project.projectId),
      projectName: String(project.name || ''),
      check: String(check.check || ''),
      severity: String(check.severity || ''),
      action: String(check.details?.action || check.action || ''),
    };

    for (const userid of members) {
      const notificationId = `mrv-${project.projectId}-${source}-${check.check}-${userid}`.replace(/[^a-zA-Z0-9-_]/g, '-');
      await Notification.updateOne(
        { notificationId },
        {
          $set: {
            userid,
            type: notificationType(check.severity),
            category: 'system',
            title,
            message,
            actionUrl: route,
            actionText: 'Open project issue',
            channels: ['in_app'],
            expiresAt,
            metadata,
            createdAt: now,
            read: false,
            readAt: null,
          },
          $setOnInsert: {
            notificationId: notificationId || uuidv4(),
            read: false,
          },
        },
        { upsert: true },
      );
    }
  }
}

module.exports = { upsertProjectIssueNotifications };