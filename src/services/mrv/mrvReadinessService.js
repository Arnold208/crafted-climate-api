'use strict';
/**
 * MRV Readiness Assessment Service
 * ══════════════════════════════════
 * Auto-checks whether a project is ready to OPEN a monitoring period.
 *
 * Checks:
 *  1. Applicability confirmed (not NOT_APPLICABLE)
 *  2. At least 1 ACTIVE SensorInstallation
 *  3. All ACTIVE installations have a valid CalibrationRecord (within interval)
 *  4. Methodology assignment exists and is CONFIRMED or APPROVED
 *  5. No other OPEN monitoring period exists
 *  6. At least one team member with a field-capable role
 *
 * Returns: { overallReady, blockers[], warnings[], checks[], assessedAt }
 */

const MRVProject                   = require('../../models/mrv/project/MRVProject.model');
const ProjectMethodologyAssignment = require('../../models/mrv/project/ProjectMethodologyAssignment.model');
const SensorInstallation           = require('../../models/mrv/evidence/SensorInstallation.model');
const CalibrationRecord            = require('../../models/mrv/evidence/CalibrationRecord.model');
const logger                       = require('../../utils/logger');
const { runApplicabilityAssessment } = require('./mrvApplicabilityService');
const { upsertProjectIssueNotifications } = require('./mrvIssueNotificationService');

// Lazy-require monitoring period to avoid missing-model crash at startup
function getMRVMonitoringPeriod() {
  try { return require('../../models/mrv/monitoring/MonitoringPeriod.model'); } catch { return null; }
}

// Default calibration validity interval if not set on the record
const DEFAULT_CALIBRATION_INTERVAL_DAYS = 365;

// Roles that qualify as field-capable
const FIELD_ROLES = new Set([
  'mrv-field-officer', 'mrv-project-manager', 'mrv-programme-admin',
]);

// Methodology assignment statuses that are acceptable for opening monitoring
const APPROVED_ASSIGNMENT_STATUSES = new Set([
  'CONFIRMED', 'APPROVED_FOR_MONITORING', 'ACTIVE', 'APPLICABILITY_APPROVED',
]);

// ── Individual checks ─────────────────────────────────────────────────────

async function checkApplicability(project) {
  const status = project.applicabilityStatus;
  if (!status || status === 'NOT_APPLICABLE') {
    return {
      check:    'applicability',
      passed:   false,
      severity: 'BLOCKER',
      message:  status === 'NOT_APPLICABLE'
        ? 'Project has been assessed as NOT_APPLICABLE for the assigned methodology. Cannot open monitoring.'
        : 'Applicability has not been assessed. Run the Applicability Assessment first.',
    };
  }
  if (status === 'REQUIRES_REVIEW') {
    return {
      check:    'applicability',
      passed:   false,
      severity: 'BLOCKER',
      message:  'Applicability status is REQUIRES_REVIEW — resolve open issues before opening monitoring.',
    };
  }
  return {
    check:    'applicability',
    passed:   true,
    severity: null,
    message:  `Applicability status: ${status}`,
  };
}

async function checkActiveInstallations(projectId) {
  const active = await SensorInstallation.find({ projectId, status: 'ACTIVE' }).lean();
  if (active.length === 0) {
    return {
      check:    'active_installations',
      passed:   false,
      severity: 'BLOCKER',
      message:  'No ACTIVE sensor installations found. Link and activate at least one device before opening monitoring.',
      details:  [],
    };
  }
  return {
    check:    'active_installations',
    passed:   true,
    severity: null,
    message:  `${active.length} ACTIVE installation(s) found`,
    details:  active.map(i => ({ auid: i.auid, model: i.model, siteId: i.siteId })),
  };
}

async function checkCalibrationRecords(projectId) {
  const activeInstallations = await SensorInstallation.find({ projectId, status: 'ACTIVE' }).lean();
  if (activeInstallations.length === 0) {
    return {
      check:    'calibration_records',
      passed:   true,
      severity: null,
      message:  'Calibration check skipped until an ACTIVE installation exists.',
    };
  }

  const now = new Date();
  const uncalibrated = [];
  const expiring     = []; // within 30 days
  const valid        = [];

  for (const inst of activeInstallations) {
    const calibrationRecords = await CalibrationRecord.find({
      auid:   inst.auid,
      status: { $in: ['VALID', 'APPROVED'] },
    }).lean();
    calibrationRecords.sort((a, b) => new Date(b.calibratedAt || b.validFrom || 0) - new Date(a.calibratedAt || a.validFrom || 0));
    const latestCal = calibrationRecords[0];

    if (!latestCal) {
      uncalibrated.push({ auid: inst.auid, model: inst.model, issue: 'No calibration record found' });
      continue;
    }

    const intervalDays = latestCal.validityIntervalDays || DEFAULT_CALIBRATION_INTERVAL_DAYS;
    const calibrationDate = latestCal.calibratedAt || latestCal.validFrom;
    const expiresAt    = new Date(calibrationDate);
    expiresAt.setDate(expiresAt.getDate() + intervalDays);

    const daysRemaining = Math.floor((expiresAt - now) / (1000 * 60 * 60 * 24));

    if (daysRemaining < 0) {
      uncalibrated.push({ auid: inst.auid, model: inst.model, issue: `Calibration expired ${Math.abs(daysRemaining)} days ago` });
    } else if (daysRemaining < 30) {
      expiring.push({ auid: inst.auid, model: inst.model, daysRemaining, expiresAt });
      valid.push(inst.auid);
    } else {
      valid.push(inst.auid);
    }
  }

  const passed = uncalibrated.length === 0;
  return {
    check:    'calibration_records',
    passed,
    severity: passed ? null : 'BLOCKER',
    message:  passed
      ? `All ${valid.length} device(s) have valid calibration records${expiring.length ? ` (${expiring.length} expiring within 30 days)` : ''}`
      : `${uncalibrated.length} device(s) have missing or expired calibration: ${uncalibrated.map(u => u.auid).join(', ')}`,
    details:  { valid, uncalibrated, expiring },
  };
}

async function checkMethodologyAssignment(projectId) {
  const assignments = await ProjectMethodologyAssignment.find({ projectId }).lean();
  assignments.sort((a, b) => new Date(b.selectedAt || 0) - new Date(a.selectedAt || 0));
  const assignment = assignments.find((item) => item.selectionStatus !== 'SUPERSEDED') || assignments[0];
  if (!assignment) {
    return {
      check:    'methodology_assignment',
      passed:   false,
      severity: 'BLOCKER',
      message:  'No methodology assignment found. Assign and confirm a methodology before opening monitoring.',
    };
  }
  const assignmentStatus = assignment.status || assignment.selectionStatus || 'CANDIDATE';
  const approved = APPROVED_ASSIGNMENT_STATUSES.has(assignmentStatus);
  return {
    check:    'methodology_assignment',
    passed:   approved,
    severity: approved ? null : 'BLOCKER',
    message:  approved
      ? `Methodology ${assignment.methodologyId} assignment status: ${assignmentStatus}`
      : `Methodology assignment status "${assignmentStatus}" is not approved for monitoring. Run applicability and resolve blockers first. Required: ${[...APPROVED_ASSIGNMENT_STATUSES].join(' | ')}`,
  };
}

async function checkNoOpenPeriod(projectId) {
  const MRVMonitoringPeriod = getMRVMonitoringPeriod();
  if (!MRVMonitoringPeriod) {
    return { check: 'no_open_period', passed: true, severity: null, message: 'Monitoring period model not loaded — check skipped' };
  }
  const openPeriod = await MRVMonitoringPeriod.findOne({
    projectId,
    status: { $in: ['OPEN', 'ACTIVE', 'IN_PROGRESS'] },
  }).lean();

  if (openPeriod) {
    return {
      check:    'no_open_period',
      passed:   false,
      severity: 'BLOCKER',
      message:  `An OPEN monitoring period already exists (${openPeriod.monitoringPeriodId}). Close it before opening a new one.`,
      details:  { openPeriodId: openPeriod.monitoringPeriodId },
    };
  }
  return {
    check:    'no_open_period',
    passed:   true,
    severity: null,
    message:  'No open monitoring periods — ready to open a new period.',
  };
}

async function checkFieldTeamMember(projectId) {
  // Members are embedded in the MRVProject document
  const project = await MRVProject.findOne({ projectId }, { members: 1 }).lean();
  const members = project?.members || [];
  const hasField = members.some(m => FIELD_ROLES.has(m.role));
  return {
    check:    'field_team_member',
    passed:   hasField,
    severity: hasField ? null : 'WARNING',
    message:  hasField
      ? `Field-capable team member present (${members.filter(m => FIELD_ROLES.has(m.role)).map(m => m.role).join(', ')})`
      : 'No field-capable team member (mrv-field-officer / mrv-project-manager). Assign one before starting field data collection.',
  };
}

// ── Main Entry Point ──────────────────────────────────────────────────────

/**
 * Run a full readiness assessment for a project.
 * Persists the result to the project record.
 *
 * @param {string} projectId
 * @returns {{ overallReady, blockers, warnings, checks, assessedAt }}
 */
async function runReadinessAssessment(projectId) {
  let project = await MRVProject.findOne({ projectId }).lean();
  if (!project) throw Object.assign(new Error(`Project not found: ${projectId}`), { status: 404 });

  if (!project.applicabilityStatus) {
    await runApplicabilityAssessment(projectId);
    project = await MRVProject.findOne({ projectId }).lean();
  }

  // Run all checks — sequential where dependencies exist, parallel elsewhere
  const [applicabilityCheck, installationsCheck, noOpenPeriodCheck, assignmentCheck, fieldTeamCheck] =
    await Promise.all([
      checkApplicability(project),
      checkActiveInstallations(projectId),
      checkNoOpenPeriod(projectId),
      checkMethodologyAssignment(projectId),
      checkFieldTeamMember(projectId),
    ]);

  // Calibration depends on installations being found
  const calibrationCheck = await checkCalibrationRecords(projectId);

  const checks     = [applicabilityCheck, assignmentCheck, installationsCheck, calibrationCheck, noOpenPeriodCheck, fieldTeamCheck];
  const blockers   = checks.filter(c => !c.passed && c.severity === 'BLOCKER').map(c => c.message);
  const warnings   = checks.filter(c => !c.passed && c.severity === 'WARNING').map(c => c.message);
  const overallReady = blockers.length === 0;
  const assessedAt = new Date();

  const projectUpdates = {
    readinessStatus:     overallReady ? 'READY' : 'NOT_READY',
    readinessAssessedAt: assessedAt,
    readinessChecks:     checks,
    updatedAt:           assessedAt,
  };

  if (overallReady && !project.sandboxFlag && ['CANDIDATE', 'APPLICABILITY_REVIEW', 'LEGAL_REVIEW'].includes(project.status)) {
    projectUpdates.status = 'READY_FOR_MONITORING';
  }

  // Persist to project
  await MRVProject.findOneAndUpdate(
    { projectId },
    { $set: projectUpdates }
  );

  logger.info(`[MRVReadiness] Project ${projectId}: ${overallReady ? 'READY' : 'NOT_READY'} (${blockers.length} blockers, ${warnings.length} warnings)`);

  return {
    projectId,
    overallReady,
    readinessStatus: overallReady ? 'READY' : 'NOT_READY',
    assessedAt,
    checks,
    summary: {
      total:    checks.length,
      passed:   checks.filter(c => c.passed).length,
      blockers,
      warnings,
    },
  };
}

module.exports = { runReadinessAssessment };
