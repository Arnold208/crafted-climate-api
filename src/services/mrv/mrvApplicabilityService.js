'use strict';

const MRVProject = require('../../models/mrv/project/MRVProject.model');
const ProjectMethodologyAssignment = require('../../models/mrv/project/ProjectMethodologyAssignment.model');
const SensorInstallation = require('../../models/mrv/evidence/SensorInstallation.model');
const logger = require('../../utils/logger');
const { evaluateDeviceMethodologySuitability } = require('./mrvDeviceSuitabilityService');
const { upsertProjectIssueNotifications } = require('./mrvIssueNotificationService');

const VM0050_ELIGIBLE_COUNTRIES = new Set([
  'Ghana', 'Kenya', 'Nigeria', 'Ethiopia', 'Uganda', 'Tanzania', 'Rwanda',
  'Senegal', "Cote d'Ivoire", 'Ivory Coast', 'Cameroon', 'Mozambique',
  'Zambia', 'Zimbabwe', 'Malawi', 'Madagascar', 'Mali', 'Burkina Faso',
  'Guinea', 'Sierra Leone', 'Liberia', 'Togo', 'Benin', 'Niger',
  'South Africa', 'Indonesia', 'India', 'Bangladesh', 'Nepal', 'Myanmar',
  'Cambodia', 'Vietnam', 'Bolivia', 'Peru', 'Colombia', 'Guatemala',
  'Honduras', 'El Salvador', 'Nicaragua', 'Haiti', 'Dominican Republic',
]);

const VM0050_ELIGIBLE_COUNTRY_CODES = new Set([
  'GH', 'KE', 'NG', 'ET', 'UG', 'TZ', 'RW', 'SN', 'CI', 'CM', 'MZ', 'ZM',
  'ZW', 'MW', 'MG', 'ML', 'BF', 'GN', 'SL', 'LR', 'TG', 'BJ', 'NE', 'ZA',
  'ID', 'IN', 'BD', 'NP', 'MM', 'KH', 'VN', 'BO', 'PE', 'CO', 'GT', 'HN',
  'SV', 'NI', 'HT', 'DO',
]);

const VM0050_ACTIVITY_TYPES = new Set([
  'CLEAN_COOKING', 'FUEL_SWITCH', 'IMPROVED_COOKSTOVE',
  'BIOMASS_REDUCTION', 'LPG_DISTRIBUTION', 'ELECTRIC_COOKING',
  'BIOGAS_COOKING',
]);

const SUPPORTED_STANDARD_VERSIONS = new Set([
  'VCS-4.7', 'VCS-5.0', 'VERRA-VCS-4.7', 'VERRA-VCS-5.0',
]);

function fail({ check, severity, message, received, expected, expectedFormat, action }) {
  return {
    check,
    passed: false,
    severity,
    message,
    details: { received, expected, expectedFormat, action },
  };
}

function pass(check, message, details = null) {
  return { check, passed: true, severity: null, message, details };
}

function checkMethodologyAssignment(assignment) {
  if (!assignment) {
    return fail({
      check: 'methodology_assignment',
      severity: 'BLOCKER',
      message: 'No methodology assignment found. Assign VM0050 to this project first.',
      received: null,
      expected: 'A ProjectMethodologyAssignment record for this project',
      action: 'Open Methodology and Applicability, select a catalogue methodology implementation, and apply it.',
    });
  }

  return pass(
    'methodology_assignment',
    `Methodology assigned: ${assignment.methodologyId} (status: ${assignment.selectionStatus || assignment.status || 'CANDIDATE'})`,
    {
      received: {
        methodologyId: assignment.methodologyId,
        methodologyVersionId: assignment.methodologyVersionId,
        standardVersionId: assignment.standardVersionId,
        selectionStatus: assignment.selectionStatus || assignment.status || 'CANDIDATE',
      },
    },
  );
}

function checkStandardVersion(standardVersionId) {
  if (!standardVersionId) {
    return fail({
      check: 'standard_version',
      severity: 'WARNING',
      message: 'Project standard version is missing. Select VERRA-VCS-5.0 or VERRA-VCS-4.7.',
      received: null,
      expected: [...SUPPORTED_STANDARD_VERSIONS],
      expectedFormat: 'VERRA-VCS-5.0 or VERRA-VCS-4.7',
      action: 'Set selectedStandardVersionId on the project or standardVersionId on the methodology assignment.',
    });
  }

  const normalized = String(standardVersionId).trim().toUpperCase();
  const supported = [...SUPPORTED_STANDARD_VERSIONS].some((value) => normalized.includes(value.replace('VERRA-', '')));
  if (!supported) {
    return fail({
      check: 'standard_version',
      severity: 'WARNING',
      message: `Standard version "${standardVersionId}" is not in the confirmed support list. Select VERRA-VCS-5.0 or VERRA-VCS-4.7.`,
      received: standardVersionId,
      expected: [...SUPPORTED_STANDARD_VERSIONS],
      expectedFormat: 'Supported Verra VCS standard version identifier',
      action: 'Update the project standard version to a supported Verra VCS version.',
    });
  }

  return pass('standard_version', `Standard version ${standardVersionId} is supported`, { received: standardVersionId });
}

function checkCountryEligibility(country) {
  if (!country) {
    return fail({
      check: 'country_eligibility',
      severity: 'WARNING',
      message: 'Project country is missing. Select the project country before running applicability.',
      received: null,
      expected: [...VM0050_ELIGIBLE_COUNTRY_CODES],
      expectedFormat: 'ISO 3166-1 alpha-2 code such as GH, KE, NG, or full country name such as Ghana',
      action: 'Set the country field on the MRV project.',
    });
  }

  const normalizedCountry = String(country).trim();
  const normalizedCode = normalizedCountry.toUpperCase();
  const eligible = VM0050_ELIGIBLE_COUNTRIES.has(normalizedCountry) || VM0050_ELIGIBLE_COUNTRY_CODES.has(normalizedCode);
  if (!eligible) {
    return fail({
      check: 'country_eligibility',
      severity: 'BLOCKER',
      message: `Country value "${normalizedCountry}" is not in the VM0050 eligible country list. Use an eligible ISO country code such as GH for Ghana, or select another supported country.`,
      received: normalizedCountry,
      expected: [...VM0050_ELIGIBLE_COUNTRY_CODES],
      expectedFormat: 'ISO 3166-1 alpha-2 country code or supported country name',
      action: 'Update the project country to an eligible VM0050 country.',
    });
  }

  return pass('country_eligibility', `${normalizedCountry} is on the VM0050 eligible country list`, { received: normalizedCountry });
}

function checkActivityType(activityTypes = []) {
  if (!activityTypes || activityTypes.length === 0) {
    return fail({
      check: 'activity_type',
      severity: 'WARNING',
      message: 'Project activity type is missing. Select a methodology-compatible activity type before running applicability.',
      received: [],
      expected: [...VM0050_ACTIVITY_TYPES],
      expectedFormat: 'Backend activity type enum such as CLEAN_COOKING',
      action: 'Set activityType to CLEAN_COOKING for VM0050 clean-cooking projects.',
    });
  }

  const received = activityTypes.map((value) => String(value).trim().toUpperCase()).filter(Boolean);
  const matched = received.filter((value) => VM0050_ACTIVITY_TYPES.has(value));
  if (!matched.length) {
    return fail({
      check: 'activity_type',
      severity: 'BLOCKER',
      message: `Activity type value "${received.join(', ')}" does not match VM0050 requirements. For clean cooking, use CLEAN_COOKING.`,
      received,
      expected: [...VM0050_ACTIVITY_TYPES],
      expectedFormat: 'Backend activity type enum',
      action: 'Update the project activity type or choose a methodology matching this project activity.',
    });
  }

  return pass('activity_type', `Activity type match: ${matched.join(', ')} qualifies for VM0050`, { received, matched });
}

async function checkSensorCapabilityMatch(projectId, methodologyId, methodologyVersionId) {
  const installations = await SensorInstallation.find({ projectId, status: 'ACTIVE' }).lean();
  if (!installations.length) {
    return fail({
      check: 'sensor_capability',
      severity: 'WARNING',
      message: 'No ACTIVE sensor installations found. Link at least one project device before applicability can fully confirm sensor capability.',
      received: 0,
      expected: 'At least one ACTIVE SensorInstallation',
      action: 'Open Installations and link an eligible organization device to this MRV project.',
    });
  }

  const evaluations = await Promise.all(installations.map((installation) => evaluateDeviceMethodologySuitability({
    device: { model: installation.model, datapoints: installation.selectedParameters?.length ? installation.selectedParameters : undefined },
    methodologyId,
    methodologyVersionId,
    selectedParameters: installation.selectedParameters,
  })));

  const qualified = evaluations.filter((item) => item.qualified);
  if (!qualified.length) {
    return fail({
      check: 'sensor_capability',
      severity: 'WARNING',
      message: `Installed device parameters do not match ${methodologyId}. Select compatible parameters on the installation or link a compatible MRV device.`,
      received: evaluations.map((item) => ({ model: item.model, measuredParameters: item.measuredParameters, selectedParameters: item.selectedParameters })),
      expected: `At least one selected parameter with direct, supporting, or indirect ${methodologyId} methodology suitability`,
      expectedFormat: 'Device datapoints matched against methodology parameter rules and MRV sensor capability catalogue',
      action: 'Open Installations, review the device parameter selection, or link a compatible device. If the parameter is indirectly measured, add or confirm the methodology mapping.',
    });
  }

  const calculationInputs = qualified.filter((item) => item.hasCalculationInput);
  const message = calculationInputs.length
    ? `Qualified calculation-capable device parameters for ${methodologyId}: ${calculationInputs.map((item) => `${item.model} (${item.matches.map((m) => m.measurementCode).join(', ')})`).join('; ')}`
    : `Only supporting or indirect device evidence is available for ${methodologyId}. Monitoring may proceed, but calculations still require approved calculation inputs.`;

  return pass('sensor_capability', message, {
    received: evaluations.map((item) => ({
      model: item.model,
      measuredParameters: item.measuredParameters,
      selectedParameters: item.selectedParameters,
      qualification: item.qualification,
      hasCalculationInput: item.hasCalculationInput,
      matches: item.matches,
      warnings: item.warnings,
      missingCalculationInputs: item.missingCalculationInputs,
    })),
    qualified: qualified.map((item) => item.model),
  });
}

function resolveApplicabilityStatus(checks) {
  const blockers = checks.filter((item) => !item.passed && item.severity === 'BLOCKER');
  const warnings = checks.filter((item) => !item.passed && item.severity === 'WARNING');
  const allPassed = checks.every((item) => item.passed);

  if (blockers.length > 0) return 'NOT_APPLICABLE';
  if (allPassed) return 'CONFIRMED';
  if (warnings.length === 1) return 'CANDIDATE';
  return 'REQUIRES_REVIEW';
}

async function runApplicabilityAssessment(projectId) {
  const project = await MRVProject.findOne({ projectId }).lean();
  if (!project) throw Object.assign(new Error(`Project not found: ${projectId}`), { status: 404 });

  const assignments = await ProjectMethodologyAssignment.find({ projectId }).lean();
  assignments.sort((a, b) => new Date(b.selectedAt || 0) - new Date(a.selectedAt || 0));
  const assignment = assignments.find((item) => item.selectionStatus !== 'SUPERSEDED') || assignments[0];

  const [countryCheck, activityCheck, stdCheck, capCheck] = await Promise.all([
    Promise.resolve(checkCountryEligibility(project.countryCode || project.country)),
    Promise.resolve(checkActivityType(project.activityTypes || (project.activityType ? [project.activityType] : []))),
    Promise.resolve(checkStandardVersion(assignment?.standardVersionId || project.selectedStandardVersionId)),
    assignment
      ? checkSensorCapabilityMatch(projectId, assignment.methodologyId, assignment.methodologyVersionId)
      : Promise.resolve(fail({
          check: 'sensor_capability',
          severity: 'WARNING',
          message: 'Cannot assess sensor capability because no methodology is assigned yet.',
          received: null,
          expected: 'Methodology assignment before sensor capability assessment',
          action: 'Assign a methodology, then run applicability again.',
        })),
  ]);

  const assignmentCheck = checkMethodologyAssignment(assignment);
  const checks = [assignmentCheck, stdCheck, countryCheck, activityCheck, capCheck];
  const applicabilityStatus = resolveApplicabilityStatus(checks);
  const assessedAt = new Date();

  if (assignment && ['CONFIRMED', 'CANDIDATE'].includes(applicabilityStatus)) {
    await ProjectMethodologyAssignment.updateOne(
      { assignmentId: assignment.assignmentId },
      { $set: { selectionStatus: 'APPLICABILITY_APPROVED', applicabilityApprovedAt: assessedAt, applicabilityApprovedBy: 'system' } },
    );
  }

  await MRVProject.findOneAndUpdate(
    { projectId },
    { $set: { applicabilityStatus, applicabilityAssessedAt: assessedAt, applicabilityChecks: checks, updatedAt: assessedAt } },
  );

  const blockerChecks = checks.filter((item) => !item.passed && item.severity === 'BLOCKER');
  const warningChecks = checks.filter((item) => !item.passed && item.severity === 'WARNING');
  const blockers = blockerChecks.map((item) => item.message);
  const warnings = warningChecks.map((item) => item.message);

  logger.info(`[MRVApplicability] Project ${projectId}: ${applicabilityStatus} (${blockers.length} blockers, ${warnings.length} warnings)`);

  return {
    projectId,
    applicabilityStatus,
    assessedAt,
    checks,
    summary: {
      total: checks.length,
      passed: checks.filter((item) => item.passed).length,
      blockers,
      warnings,
      blockerChecks,
      warningChecks,
    },
  };
}

module.exports = { runApplicabilityAssessment, resolveApplicabilityStatus };