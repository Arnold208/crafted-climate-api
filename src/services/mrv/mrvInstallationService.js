'use strict';
/**
 * MRV Installation Service
 * ════════════════════════
 * Manages the full lifecycle of sensor installations on MRV projects.
 *
 * Business Rules:
 *   1. Device must belong to the same org as the project
 *   2. Device model must match a SensorCapability linked to the project's methodology
 *   3. Device cannot already have an ACTIVE/MAINTENANCE installation on this project+site
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
const MRVSensorCapability = require('../../models/mrv/catalogue/MRVSensorCapability.model');
const ProjectMethodologyAssignment = require('../../models/mrv/project/ProjectMethodologyAssignment.model');
const { logMRVEvent } = require('./mrvAuditService');
const logger             = require('../../utils/logger');

// Project statuses that block new installations
const CLOSED_STATUSES = ['CLOSED', 'COMPLETED', 'ARCHIVED', 'CANCELLED'];

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

async function validateDeviceCapability(device, projectId) {
  // Get the project's methodology assignment
  const assignment = await ProjectMethodologyAssignment.findOne({ projectId }).lean();
  if (!assignment) return; // no methodology yet — allow installation, warn later in readiness check

  // Check if this device model has any capability mapping to the project's methodology
  const capability = await MRVSensorCapability.findOne({
    model: device.model,
    'methodologyMappings.methodologyId': assignment.methodologyId,
    'methodologyMappings.qualification': { $ne: 'NOT_QUALIFIED' }
  }).lean();

  if (!capability) {
    logger.warn(`[MRVInstallation] Device model=${device.model} has no qualified capability for methodology=${assignment.methodologyId}. Installation allowed but will be flagged in readiness assessment.`);
    // We warn but don't block — the readiness assessment will flag this as a blocker
    // This allows field teams to install first and fix methodology assignment later
  }
}

async function validateNoActiveInstallation(auid, projectId, siteId) {
  const existing = await SensorInstallation.findOne({
    auid,
    projectId,
    ...(siteId ? { siteId } : {}),
    status: { $in: ['ACTIVE', 'MAINTENANCE', 'PLANNED'] }
  }).lean();

  if (existing) {
    throw Object.assign(
      new Error(`Device auid=${auid} already has an active installation on this project (installationId=${existing.installationId}, status=${existing.status})`),
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
  await validateDeviceCapability(device, projectId);

  // 6. Validate no duplicate active installation
  await validateNoActiveInstallation(auid, projectId, data.siteId);

  // 7. Create installation record
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
    expectedFrequencySeconds: data.expectedFrequencySeconds || 3600,
    installationNotes:    data.installationNotes || null,
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
    metadata:        { auid, model: device.model, siteId: data.siteId }
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
