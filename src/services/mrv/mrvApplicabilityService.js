'use strict';
/**
 * MRV Applicability Assessment Service
 * ══════════════════════════════════════
 * Auto-checks whether VM0050 (or any assigned methodology) applies to a project.
 *
 * Checks (in order):
 *  1. Methodology assignment exists
 *  2. Standard version is supported
 *  3. Country eligibility
 *  4. Activity type match
 *  5. At least one ACTIVE sensor installation with a qualified capability
 *
 * Result:
 *  CONFIRMED        — all checks passed
 *  CANDIDATE        — most checks pass, one advisory warning
 *  REQUIRES_REVIEW  — critical check failed but project could still qualify with manual review
 *  NOT_APPLICABLE   — hard blocker (e.g. country not in approved list)
 */

const { v4: uuidv4 } = require('uuid');
const MRVProject                   = require('../../models/mrv/project/MRVProject.model');
const ProjectMethodologyAssignment = require('../../models/mrv/project/ProjectMethodologyAssignment.model');
const MRVMethodologyVersion        = require('../../models/mrv/catalogue/MRVMethodologyVersion.model');
const MRVSensorCapability          = require('../../models/mrv/catalogue/MRVSensorCapability.model');
const SensorInstallation           = require('../../models/mrv/evidence/SensorInstallation.model');
const logger                       = require('../../utils/logger');

// ── VM0050 Eligibility Config ─────────────────────────────────────────────
// Countries where VM0050 clean-cooking projects are currently approved by Verra.
const VM0050_ELIGIBLE_COUNTRIES = new Set([
  'Ghana', 'Kenya', 'Nigeria', 'Ethiopia', 'Uganda', 'Tanzania', 'Rwanda',
  'Senegal', "Côte d'Ivoire", 'Ivory Coast', 'Cameroon', 'Mozambique',
  'Zambia', 'Zimbabwe', 'Malawi', 'Madagascar', 'Mali', 'Burkina Faso',
  'Guinea', 'Sierra Leone', 'Liberia', 'Togo', 'Benin', 'Niger',
  'South Africa', 'Indonesia', 'India', 'Bangladesh', 'Nepal', 'Myanmar',
  'Cambodia', 'Vietnam', 'Bolivia', 'Peru', 'Colombia', 'Guatemala',
  'Honduras', 'El Salvador', 'Nicaragua', 'Haiti', 'Dominican Republic',
]);

// Activity types that map to VM0050
const VM0050_ACTIVITY_TYPES = new Set([
  'CLEAN_COOKING', 'FUEL_SWITCH', 'IMPROVED_COOKSTOVE',
  'BIOMASS_REDUCTION', 'LPG_DISTRIBUTION', 'ELECTRIC_COOKING',
  'BIOGAS_COOKING',
]);

// Supported standard versions for VM0050
const SUPPORTED_STANDARD_VERSIONS = new Set([
  'VCS-4.7', 'VCS-5.0', 'VERRA-VCS-4.7', 'VERRA-VCS-5.0',
]);

// ── Check Functions ───────────────────────────────────────────────────────

function checkMethodologyAssignment(assignment) {
  if (!assignment) {
    return {
      check:    'methodology_assignment',
      passed:   false,
      severity: 'BLOCKER',
      message:  'No methodology assignment found. Assign VM0050 to this project first.',
    };
  }
  return {
    check:    'methodology_assignment',
    passed:   true,
    severity: null,
    message:  `Methodology assigned: ${assignment.methodologyId} (status: ${assignment.status})`,
  };
}

function checkStandardVersion(methodologyVersionId) {
  if (!methodologyVersionId) {
    return {
      check:    'standard_version',
      passed:   false,
      severity: 'WARNING',
      message:  'Methodology version not specified. Specify the VCS version (4.7 or 5.0).',
    };
  }
  const supported = [...SUPPORTED_STANDARD_VERSIONS].some(v =>
    methodologyVersionId.toUpperCase().includes(v.replace('VERRA-', ''))
  );
  return {
    check:    'standard_version',
    passed:   supported,
    severity: supported ? null : 'WARNING',
    message:  supported
      ? `Standard version ${methodologyVersionId} is supported`
      : `Standard version ${methodologyVersionId} is not in the confirmed support list. Manual review recommended.`,
  };
}

function checkCountryEligibility(country) {
  if (!country) {
    return {
      check:    'country_eligibility',
      passed:   false,
      severity: 'WARNING',
      message:  'Project country not set. Set the project country to confirm eligibility.',
    };
  }
  const eligible = VM0050_ELIGIBLE_COUNTRIES.has(country);
  return {
    check:    'country_eligibility',
    passed:   eligible,
    severity: eligible ? null : 'BLOCKER',
    message:  eligible
      ? `${country} is on the VM0050 eligible country list`
      : `${country} is not currently on the VM0050 approved country list. This project is likely NOT_APPLICABLE.`,
  };
}

function checkActivityType(activityTypes = []) {
  if (!activityTypes || activityTypes.length === 0) {
    return {
      check:    'activity_type',
      passed:   false,
      severity: 'WARNING',
      message:  'No activity types defined on this project.',
    };
  }
  const matched = activityTypes.filter(a => VM0050_ACTIVITY_TYPES.has(a));
  const passed  = matched.length > 0;
  return {
    check:    'activity_type',
    passed,
    severity: passed ? null : 'BLOCKER',
    message:  passed
      ? `Activity type match: ${matched.join(', ')} qualifies for VM0050`
      : `No activity types match VM0050 requirements. Project activities: ${activityTypes.join(', ')}`,
  };
}

async function checkSensorCapabilityMatch(projectId, methodologyId) {
  // Are there any ACTIVE installations whose device model has a qualified mapping?
  const installations = await SensorInstallation.find({ projectId, status: 'ACTIVE' }).lean();
  if (installations.length === 0) {
    return {
      check:    'sensor_capability',
      passed:   false,
      severity: 'WARNING',
      message:  'No ACTIVE sensor installations found. Link at least one device to this project.',
    };
  }

  const models = [...new Set(installations.map(i => i.model).filter(Boolean))];
  const qualified = [];
  for (const model of models) {
    const cap = await MRVSensorCapability.findOne({
      model,
      'methodologyMappings.methodologyId': methodologyId,
      'methodologyMappings.qualification': { $ne: 'NOT_QUALIFIED' },
    }).lean();
    if (cap) qualified.push(model);
  }

  const passed = qualified.length > 0;
  return {
    check:    'sensor_capability',
    passed,
    severity: passed ? null : 'WARNING',
    message:  passed
      ? `Qualified sensors for ${methodologyId}: ${qualified.join(', ')}`
      : `Installed device models (${models.join(', ')}) have no qualified capability mapping for ${methodologyId}. Update sensor capability catalogue or install compatible sensors.`,
  };
}

// ── Determine Overall Status ──────────────────────────────────────────────

function resolveApplicabilityStatus(checks) {
  const blockers  = checks.filter(c => !c.passed && c.severity === 'BLOCKER');
  const warnings  = checks.filter(c => !c.passed && c.severity === 'WARNING');
  const allPassed = checks.every(c => c.passed);

  if (blockers.length > 0)   return 'NOT_APPLICABLE';
  if (allPassed)             return 'CONFIRMED';
  if (warnings.length === 1) return 'CANDIDATE';
  return 'REQUIRES_REVIEW';
}

// ── Main Entry Point ──────────────────────────────────────────────────────

/**
 * Run a full applicability assessment for a project.
 * Results are returned and optionally stored on the project record.
 *
 * @param {string} projectId
 * @returns {{ applicabilityStatus, checks, assessedAt, summary }}
 */
async function runApplicabilityAssessment(projectId) {
  const project = await MRVProject.findOne({ projectId }).lean();
  if (!project) throw Object.assign(new Error(`Project not found: ${projectId}`), { status: 404 });

  const assignment = await ProjectMethodologyAssignment.findOne({ projectId }).lean();

  // Run all checks in parallel where possible
  const [countryCheck, activityCheck, stdCheck, capCheck] = await Promise.all([
    Promise.resolve(checkCountryEligibility(project.countryCode || project.country)),
    Promise.resolve(checkActivityType(project.activityTypes || [])),
    Promise.resolve(checkStandardVersion(assignment?.methodologyVersionId)),
    assignment
      ? checkSensorCapabilityMatch(projectId, assignment.methodologyId)
      : Promise.resolve({
          check:    'sensor_capability',
          passed:   false,
          severity: 'WARNING',
          message:  'Cannot assess sensor capability — no methodology assigned yet.',
        }),
  ]);

  const assignmentCheck = checkMethodologyAssignment(assignment);
  const checks = [assignmentCheck, stdCheck, countryCheck, activityCheck, capCheck];
  const applicabilityStatus = resolveApplicabilityStatus(checks);
  const assessedAt = new Date();

  // Persist result back to project
  await MRVProject.findOneAndUpdate(
    { projectId },
    {
      $set: {
        applicabilityStatus,
        applicabilityAssessedAt: assessedAt,
        applicabilityChecks:     checks,
        updatedAt:               assessedAt,
      },
    }
  );

  const blockers = checks.filter(c => !c.passed && c.severity === 'BLOCKER').map(c => c.message);
  const warnings = checks.filter(c => !c.passed && c.severity === 'WARNING').map(c => c.message);

  logger.info(`[MRVApplicability] Project ${projectId}: ${applicabilityStatus} (${blockers.length} blockers, ${warnings.length} warnings)`);

  return {
    projectId,
    applicabilityStatus,
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

module.exports = { runApplicabilityAssessment };
