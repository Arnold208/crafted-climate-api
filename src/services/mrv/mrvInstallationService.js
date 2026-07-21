'use strict';
/**
 * MRV Installation Service
 * ════════════════════════
 * Manages the full lifecycle of sensor installations on MRV projects.
 *
 * Business Rules:
 *   1. Device must belong to the same org as the project
 *   2. Device model must match a SensorCapability linked to the project's methodology
 *   3. Device cannot already have an ACTIVE/MAINTENANCE/PLANNED installation in another MRV project
 *   4. Project must not be CLOSED/COMPLETED/ARCHIVED
 *   5. Installations are NEVER deleted — status changes only (full audit trail)
 *   6. ACTIVE → MAINTENANCE: temporary offline (returns to ACTIVE after)
 *   7. ACTIVE/MAINTENANCE → REPLACED: device swap (old record preserved, validTo set)
 *   8. ACTIVE → DECOMMISSIONED: only when project closes
 */

const { v4: uuidv4 } = require('uuid');
const SensorInstallation = require('../../models/mrv/evidence/SensorInstallation.model');
const MRVProject         = require('../../models/mrv/project/MRVProject.model');
const Device             = require('../../models/devices/registerDevice');
const ProjectMethodologyAssignment = require('../../models/mrv/project/ProjectMethodologyAssignment.model');
const { logMRVEvent } = require('./mrvAuditService');
const { evaluateDeviceMethodologySuitability } = require('./mrvDeviceSuitabilityService');
const logger             = require('../../utils/logger');

// Project statuses that block new installations
const CLOSED_STATUSES = ['CLOSED', 'COMPLETED', 'ARCHIVED', 'CANCELLED'];
const SCHEDULE_LIMITS = Object.freeze({
  minFrequencyMinutes: 5,
  maxFrequencyMinutes: 180,
  frequencyStepMinutes: 5,
  minBatch: 2,
  maxTransmitWindowMinutes: 720,
  inboundGraceMinutes: 5,
});

function toPositiveInteger(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw Object.assign(new Error(`${fieldName} must be a whole number.`), { status: 400 });
  return parsed;
}

function deriveScheduleConfig(frequency, batch) {
  const frequencyMinutes = toPositiveInteger(frequency, 'Frequency');
  const batchCount = toPositiveInteger(batch, 'Batch size');
  if (frequencyMinutes < SCHEDULE_LIMITS.minFrequencyMinutes) throw Object.assign(new Error(`Minimum reporting frequency is ${SCHEDULE_LIMITS.minFrequencyMinutes} minutes.`), { status: 400 });
  if (frequencyMinutes > SCHEDULE_LIMITS.maxFrequencyMinutes) throw Object.assign(new Error(`Maximum reporting frequency is ${SCHEDULE_LIMITS.maxFrequencyMinutes} minutes.`), { status: 400 });
  if (frequencyMinutes % SCHEDULE_LIMITS.frequencyStepMinutes !== 0) throw Object.assign(new Error(`Reporting frequency must be in ${SCHEDULE_LIMITS.frequencyStepMinutes}-minute steps.`), { status: 400 });
  if (batchCount < SCHEDULE_LIMITS.minBatch) throw Object.assign(new Error(`Minimum batch size is ${SCHEDULE_LIMITS.minBatch} readings.`), { status: 400 });
  const maxBatch = Math.max(SCHEDULE_LIMITS.minBatch, Math.floor(SCHEDULE_LIMITS.maxTransmitWindowMinutes / frequencyMinutes));
  if (batchCount > maxBatch) throw Object.assign(new Error(`Maximum batch size is ${maxBatch} for a ${frequencyMinutes}-minute frequency.`), { status: 400 });
  const batchWindowMinutes = frequencyMinutes * batchCount;
  return {
    frequency: frequencyMinutes,
    batch: batchCount,
    batchWindowMinutes,
    inboundGraceMinutes: SCHEDULE_LIMITS.inboundGraceMinutes,
    expectedFrequencySeconds: frequencyMinutes * 60,
  };
}

// ── Validation helpers ────────────────────────────────────────────────────

async function validateProjectOpen(project) {
  if (CLOSED_STATUSES.includes(project.status)) {
    throw Object.assign(new Error(`Project is ${project.status} — no new installations allowed`), { status: 409 });
  }
}

async function validateDeviceOwnership(device, project) {
  if (device.organizationId !== project.organizationId) {
    throw Object.assign(
      new Error(`Device auid=${device.auid} belongs to org ${device.organizationId}, not project org ${project.organizationId}`),
      { status: 403 }
    );
  }
}

async function validateDeviceCapability(device, projectId, selectedParameters) {
  const assignment = await ProjectMethodologyAssignment.findOne({ projectId }).lean();
  if (!assignment) return null; // no methodology yet - allow installation, warn later in readiness check

  const suitability = await evaluateDeviceMethodologySuitability({
    device,
    methodologyId: assignment.methodologyId,
    methodologyVersionId: assignment.methodologyVersionId,
    selectedParameters,
  });

  if (!suitability.qualified) {
    logger.warn(`[MRVInstallation] Device model=${device.model} has no selected parameter suitable for methodology=${assignment.methodologyId}. Installation allowed but readiness will flag it.`);
  } else if (!suitability.hasCalculationInput) {
    logger.info(`[MRVInstallation] Device model=${device.model} is supporting evidence for methodology=${assignment.methodologyId}, not primary calculation input.`);
  }

  return suitability;
}

async function validateNoActiveInstallation(auid, projectId) {
  const existing = await SensorInstallation.findOne({
    auid,
    status: { $in: ['ACTIVE', 'MAINTENANCE', 'PLANNED'] }
  }).lean();

  if (existing) {
    const scope = existing.projectId === projectId ? 'this project' : `project ${existing.projectId}`;
    throw Object.assign(
      new Error(`Device auid=${auid} already has an active MRV installation on ${scope} (installationId=${existing.installationId}, status=${existing.status})`),
      { status: 409 }
    );
  }
}

// ── Link Device to Project ────────────────────────────────────────────────

/**
 * Link an existing registered device to an MRV project.
 * Creates a SensorInstallation record and enables MRV flags on the device.
 *
 * @param {string} projectId
 * @param {string} auid - the device's unique auid
 * @param {object} data - { siteId, validFrom, positionDescription, coordinates, expectedFrequencySeconds, installationNotes }
 * @param {string} requestingUserId
 * @returns {SensorInstallation}
 */
async function linkDevice(projectId, auid, data, requestingUserId) {
  // 1. Fetch project
  const project = await MRVProject.findOne({ projectId }).lean();
  if (!project) throw Object.assign(new Error(`Project not found: ${projectId}`), { status: 404 });

  // 2. Fetch device
  const device = await Device.findOne({ auid }).lean();
  if (!device) throw Object.assign(new Error(`Device not found: auid=${auid}. Register the device first.`), { status: 404 });

  // 3. Validate project is open
  await validateProjectOpen(project);

  // 4. Validate device belongs to the same org
  await validateDeviceOwnership(device, project);

  // 5. Validate device capability (warn if mismatch, don't block)
  const suitability = await validateDeviceCapability(device, projectId, data.selectedParameters || data.monitoredParameters);

  // 6. Validate no duplicate active installation
  await validateNoActiveInstallation(auid, projectId);

  // 7. Create installation record
  const schedule = deriveScheduleConfig(
    data.frequency !== undefined ? data.frequency : (device.frequency || 30),
    data.batch !== undefined ? data.batch : (device.batch || 2),
  );
  const installationId = `INST-${uuidv4()}`;
  const installation = await SensorInstallation.create({
    installationId,
    projectId,
    siteId:               data.siteId || null,
    organizationId:       project.organizationId,
    auid,
    devid:                device.devid,
    model:                device.model,
    validFrom:            data.validFrom ? new Date(data.validFrom) : new Date(),
    validTo:              null,
    coordinates:          data.coordinates || null,
    positionDescription:  data.positionDescription || null,
    frequency:            schedule.frequency,
    batch:                schedule.batch,
    batchWindowMinutes:   schedule.batchWindowMinutes,
    inboundGraceMinutes:  schedule.inboundGraceMinutes,
    expectedFrequencySeconds: schedule.expectedFrequencySeconds,
    installationNotes:    data.installationNotes || null,
    selectedParameters:   suitability?.selectedParameters || [],
    suitabilitySnapshot:  suitability || null,
    status:               'ACTIVE',
    installedBy:          requestingUserId,
    installedAt:          new Date(),
  });

  // 8. Enable MRV flags on the device
  await Device.findOneAndUpdate(
    { auid },
    {
      $set: { mrvEnabled: true, retentionClass: 'MRV' },
      $addToSet: {
        mrvProjectAssignments: {
          projectId,
          siteId:         data.siteId || null,
          installationId
        }
      }
    }
  );

  // 9. Audit event
  await logMRVEvent({
    projectId,
    organizationId:  project.organizationId,
    action:          'INSTALLATION_LINKED',
    actorId:         requestingUserId,
    entityType:      'SensorInstallation',
    entityId:        installationId,
    metadata:        { auid, model: device.model, siteId: data.siteId, selectedParameters: suitability?.selectedParameters || [], suitability: suitability ? { qualified: suitability.qualified, qualification: suitability.qualification, hasCalculationInput: suitability.hasCalculationInput } : null }
  });

  logger.info(`[MRVInstallation] Device linked: auid=${auid} → project=${projectId} (${installationId})`);
  return installation;
}

// ── Maintenance Mode ──────────────────────────────────────────────────────

/**
 * Put a device into MAINTENANCE mode (temporary offline).
 * Device is expected to return — data gap is logged and expected.
 *
 * @param {string} installationId
 * @param {object} data - { reason, expectedReturnDate, notes }
 * @param {string} requestingUserId
 */
async function startMaintenance(installationId, data, requestingUserId) {
  const installation = await SensorInstallation.findOne({ installationId });
  if (!installation) throw Object.assign(new Error(`Installation not found: ${installationId}`), { status: 404 });

  if (installation.status !== 'ACTIVE' && installation.status !== 'PLANNED') {
    throw Object.assign(
      new Error(`Cannot start maintenance on installation with status=${installation.status}. Must be ACTIVE.`),
      { status: 409 }
    );
  }

  // Check project is not closed
  const project = await MRVProject.findOne({ projectId: installation.projectId }).lean();
  await validateProjectOpen(project);

  installation.status                  = 'MAINTENANCE';
  installation.maintenanceReason       = data.reason;
  installation.maintenanceExpectedReturn = data.expectedReturnDate ? new Date(data.expectedReturnDate) : null;
  installation.maintenanceStartedAt    = new Date();
  installation.maintenanceStartedBy    = requestingUserId;
  installation.maintenanceNotes        = data.notes || null;
  installation.updatedAt               = new Date();
  await installation.save();

  await logMRVEvent({
    projectId:      installation.projectId,
    organizationId: installation.organizationId,
    action:         'INSTALLATION_MAINTENANCE_STARTED',
    actorId:        requestingUserId,
    entityType:     'SensorInstallation',
    entityId:       installationId,
    metadata:       { auid: installation.auid, reason: data.reason, expectedReturnDate: data.expectedReturnDate }
  });

  logger.info(`[MRVInstallation] Maintenance started: ${installationId} (auid=${installation.auid})`);
  return installation;
}

/**
 * Return a device from MAINTENANCE mode back to ACTIVE.
 */
async function endMaintenance(installationId, data, requestingUserId) {
  const installation = await SensorInstallation.findOne({ installationId });
  if (!installation) throw Object.assign(new Error(`Installation not found: ${installationId}`), { status: 404 });

  if (installation.status !== 'MAINTENANCE') {
    throw Object.assign(new Error(`Installation is not in MAINTENANCE (status=${installation.status})`), { status: 409 });
  }

  installation.status               = 'ACTIVE';
  installation.maintenanceReturnedAt = new Date();
  installation.maintenanceReturnedBy = requestingUserId;
  if (data.notes) installation.maintenanceNotes = (installation.maintenanceNotes || '') + ' | Return notes: ' + data.notes;
  installation.updatedAt = new Date();
  await installation.save();

  await logMRVEvent({
    projectId:      installation.projectId,
    organizationId: installation.organizationId,
    action:         'INSTALLATION_MAINTENANCE_ENDED',
    actorId:        requestingUserId,
    entityType:     'SensorInstallation',
    entityId:       installationId,
    metadata:       { auid: installation.auid }
  });

  logger.info(`[MRVInstallation] Maintenance ended — device back ACTIVE: ${installationId}`);
  return installation;
}

// ── Replace Device ────────────────────────────────────────────────────────

/**
 * Replace a device on a project.
 * - Old installation: status → REPLACED, validTo set, replacedByInstallationId set
 * - New device: new SensorInstallation created as ACTIVE
 * - Both installation records are preserved for full audit trail
 *
 * @param {string} oldInstallationId
 * @param {string} newAuid - auid of the replacement device
 * @param {object} data - { reason, notes, siteId, positionDescription, expectedFrequencySeconds }
 * @param {string} requestingUserId
 */
async function replaceDevice(oldInstallationId, newAuid, data, requestingUserId) {
  const oldInstallation = await SensorInstallation.findOne({ installationId: oldInstallationId });
  if (!oldInstallation) throw Object.assign(new Error(`Installation not found: ${oldInstallationId}`), { status: 404 });

  if (!['ACTIVE', 'MAINTENANCE'].includes(oldInstallation.status)) {
    throw Object.assign(
      new Error(`Can only replace ACTIVE or MAINTENANCE installations (status=${oldInstallation.status})`),
      { status: 409 }
    );
  }

  const project = await MRVProject.findOne({ projectId: oldInstallation.projectId }).lean();
  await validateProjectOpen(project);

  // Validate the new device
  const newDevice = await Device.findOne({ auid: newAuid }).lean();
  if (!newDevice) throw Object.assign(new Error(`Replacement device not found: auid=${newAuid}`), { status: 404 });
  await validateDeviceOwnership(newDevice, project);

  // Ensure new device isn't already active on this project
  await validateNoActiveInstallation(newAuid, oldInstallation.projectId, oldInstallation.siteId);

  const now = new Date();
  const newInstallationId = `INST-${uuidv4()}`;

  // Close old installation
  oldInstallation.status                   = 'REPLACED';
  oldInstallation.validTo                  = now;
  oldInstallation.replacedByInstallationId = newInstallationId;
  oldInstallation.replacementReason        = data.reason || 'OTHER';
  oldInstallation.replacementNotes         = data.notes || null;
  oldInstallation.replacedAt               = now;
  oldInstallation.replacedBy               = requestingUserId;
  oldInstallation.updatedAt                = now;
  await oldInstallation.save();

  // Create new installation
  const newInstallation = await SensorInstallation.create({
    installationId:           newInstallationId,
    projectId:                oldInstallation.projectId,
    siteId:                   data.siteId || oldInstallation.siteId,
    organizationId:           oldInstallation.organizationId,
    auid:                     newAuid,
    devid:                    newDevice.devid,
    model:                    newDevice.model,
    validFrom:                now,
    validTo:                  null,
    coordinates:              data.coordinates || oldInstallation.coordinates,
    positionDescription:      data.positionDescription || oldInstallation.positionDescription,
    expectedFrequencySeconds: data.expectedFrequencySeconds || oldInstallation.expectedFrequencySeconds,
    status:                   'ACTIVE',
    replacedById:             oldInstallationId,
    installedBy:              requestingUserId,
    installedAt:              now,
  });

  // Enable MRV on new device
  await Device.findOneAndUpdate(
    { auid: newAuid },
    {
      $set: { mrvEnabled: true, retentionClass: 'MRV' },
      $addToSet: { mrvProjectAssignments: { projectId: oldInstallation.projectId, siteId: oldInstallation.siteId, installationId: newInstallationId } }
    }
  );

  await logMRVEvent({
    projectId:      oldInstallation.projectId,
    organizationId: oldInstallation.organizationId,
    action:         'INSTALLATION_DEVICE_REPLACED',
    actorId:        requestingUserId,
    entityType:     'SensorInstallation',
    entityId:       oldInstallationId,
    metadata:       { oldAuid: oldInstallation.auid, newAuid, newInstallationId, reason: data.reason }
  });

  logger.info(`[MRVInstallation] Device replaced: ${oldInstallation.auid} → ${newAuid} on project=${oldInstallation.projectId}`);
  return { oldInstallation, newInstallation };
}

// ── Decommission (on project close) ──────────────────────────────────────

/**
 * Decommission all active installations when a project closes.
 * Called automatically by project close logic — not exposed as a standalone endpoint.
 *
 * @param {string} projectId
 * @param {string} requestingUserId
 * @param {string} reason - e.g. 'PROJECT_CLOSED', 'PROJECT_COMPLETED'
 */
async function decommissionAll(projectId, requestingUserId, reason = 'PROJECT_CLOSED') {
  const now = new Date();
  const result = await SensorInstallation.updateMany(
    { projectId, status: { $in: ['ACTIVE', 'MAINTENANCE', 'PLANNED'] } },
    {
      $set: {
        status:             'DECOMMISSIONED',
        validTo:            now,
        decommissionedAt:   now,
        decommissionedBy:   requestingUserId,
        decommissionReason: reason,
        updatedAt:          now
      }
    }
  );

  logger.info(`[MRVInstallation] Decommissioned ${result.modifiedCount} installations for project=${projectId} (reason: ${reason})`);
  return result.modifiedCount;
}

// ── List / Get ────────────────────────────────────────────────────────────

async function listInstallations(projectId, { status, siteId } = {}) {
  const filter = { projectId };
  if (status) filter.status = status;
  if (siteId) filter.siteId = siteId;
  return SensorInstallation.find(filter).sort({ createdAt: -1 }).lean();
}

async function getInstallation(installationId) {
  const inst = await SensorInstallation.findOne({ installationId }).lean();
  if (!inst) throw Object.assign(new Error(`Installation not found: ${installationId}`), { status: 404 });
  return inst;
}

module.exports = {
  linkDevice,
  startMaintenance,
  endMaintenance,
  replaceDevice,
  decommissionAll,
  listInstallations,
  getInstallation,
};


