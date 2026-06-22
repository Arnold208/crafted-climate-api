'use strict';
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const authenticateToken = require('../../middleware/bearermiddleware');
const { verifyMRVProjectAccess } = require('../../middleware/mrv/verifyMRVProjectAccess');
const { mrvAuditEvent } = require('../../middleware/mrv/mrvAuditEvent');
const { requirePermission } = require('../../middleware/authenticateApiKey');
const { hashBuffer } = require('../../services/mrv/mrvHashService');
const { uploadEvidence, generateUploadToken } = require('../../services/mrv/mrvBlobService');
const installationSvc = require('../../services/mrv/mrvInstallationService');
const ExternalEvidenceRecord = require('../../models/mrv/evidence/ExternalEvidenceRecord.model');
const ManualObservation = require('../../models/mrv/evidence/ManualObservation.model');
const CSVImport = require('../../models/mrv/evidence/CSVImport.model');
const SensorInstallation = require('../../models/mrv/evidence/SensorInstallation.model');
const CalibrationRecord = require('../../models/mrv/evidence/CalibrationRecord.model');
const TelemetryReceipt = require('../../models/mrv/evidence/TelemetryReceipt.model');
const Device = require('../../models/devices/registerDevice');


const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ── External Evidence Files ────────────────────────────────────────────────

/**
 * @swagger
 * /api/mrv/projects/{projectId}/evidence:
 *   get:
 *     summary: List external evidence records for a project
 *     description: Returns uploaded evidence files (photos, PDFs, lab reports, meter certificates, etc.). Filter by type or monitoring period.
 *     tags: [MRV Engine - Evidence and Ingest]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: evidenceType
 *         schema:
 *           type: string
 *           enum: [SITE_PHOTO, HOUSEHOLD_SURVEY, STOVE_PHOTO, METER_PHOTO, METER_READING_SHEET, CALIBRATION_CERTIFICATE, LAB_REPORT, PARTICIPANT_AGREEMENT, PROJECT_DESCRIPTION, MONITORING_REPORT, VERIFICATION_REPORT, LEGAL_DOCUMENT, OTHER]
 *       - in: query
 *         name: monitoringPeriodId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Evidence records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { type: object } }
 */
router.get('/:projectId/evidence', authenticateToken, requirePermission('mrv:evidence:read'), verifyMRVProjectAccess(), async (req, res) => {
  try {
    const filter = { projectId: req.params.projectId };
    if (req.query.evidenceType) filter.evidenceType = req.query.evidenceType;
    if (req.query.monitoringPeriodId) filter.monitoringPeriodId = req.query.monitoringPeriodId;
    const records = await ExternalEvidenceRecord.find(filter).sort({ _id: -1 }).lean();
    res.json({ success: true, data: records });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/evidence/upload:
 *   post:
 *     summary: Upload an evidence file (photo, PDF, certificate, etc.)
 *     description: |
 *       Accepts a `multipart/form-data` upload. The file is hashed (SHA-256) and stored in Azure Blob Storage.
 *       A `ExternalEvidenceRecord` is created in `PENDING_REVIEW` status.
 *
 *       **Max file size:** 50 MB
 *     tags: [MRV Engine - Evidence and Ingest]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [evidenceType, file]
 *             properties:
 *               evidenceType:
 *                 type: string
 *                 enum: [SITE_PHOTO, HOUSEHOLD_SURVEY, STOVE_PHOTO, METER_PHOTO, METER_READING_SHEET, CALIBRATION_CERTIFICATE, LAB_REPORT, PARTICIPANT_AGREEMENT, PROJECT_DESCRIPTION, MONITORING_REPORT, VERIFICATION_REPORT, LEGAL_DOCUMENT, OTHER]
 *               title: { type: string, description: "Display name for the evidence record" }
 *               description: { type: string }
 *               monitoringPeriodId: { type: string }
 *               siteId: { type: string }
 *               activityDate: { type: string, format: date, description: "Date the evidence was collected" }
 *               relatedEntityType: { type: string, example: SensorInstallation }
 *               relatedEntityId: { type: string }
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Evidence uploaded and record created in PENDING_REVIEW
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     evidenceId: { type: string }
 *                     fileHash: { type: string, description: "SHA-256 hash of the uploaded file" }
 *                     blobPath: { type: string }
 *                     status: { type: string, example: PENDING_REVIEW }
 *       400: { description: File and evidenceType are required }
 *       403: { description: Insufficient role }
 */
router.post('/:projectId/evidence/upload', authenticateToken,
  requirePermission('mrv:evidence:write'),
  verifyMRVProjectAccess(['mrv-project-manager', 'mrv-field-officer', 'mrv-data-reviewer', 'mrv-programme-admin']),
  upload.single('file'),
  mrvAuditEvent({ action: 'EVIDENCE_UPLOADED', entityType: 'ExternalEvidenceRecord', getEntityId: (req, body) => body?.data?.evidenceId }),
  async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File is required' });
    const { evidenceType, title, description, monitoringPeriodId, siteId, activityDate, relatedEntityType, relatedEntityId } = req.body;
    if (!evidenceType) return res.status(400).json({ error: 'evidenceType is required' });
    const evidenceId = `EVD-${uuidv4()}`;
    const fileHash = hashBuffer(req.file.buffer);
    const blobResult = await uploadEvidence({ projectId: req.params.projectId, evidenceId, buffer: req.file.buffer, mimeType: req.file.mimetype, filename: req.file.originalname, metadata: { evidenceType, uploadedBy: req.user?.userid } });
    const record = await ExternalEvidenceRecord.create({
      evidenceId, projectId: req.params.projectId, organizationId: req.mrvProject.organizationId,
      monitoringPeriodId: monitoringPeriodId || null, siteId: siteId || null,
      evidenceType, title: title || req.file.originalname, description,
      activityDate: activityDate ? new Date(activityDate) : null,
      uploadedAt: new Date(), uploadedBy: req.user?.userid,
      mimeType: req.file.mimetype, fileSize: req.file.size, fileHash,
      blobPath: blobResult?.blobPath || null, blobContainer: blobResult?.blobContainer || 'mrv-evidence',
      relatedEntityType: relatedEntityType || null, relatedEntityId: relatedEntityId || null,
      status: 'PENDING_REVIEW'
    });
    res.status(201).json({ success: true, data: record });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/evidence/upload-token:
 *   post:
 *     summary: Get a pre-signed upload token for large file uploads
 *     description: Returns a blob URL and expiry time for direct client-to-Azure uploads (avoids routing large files through the API server).
 *     tags: [MRV Engine - Evidence and Ingest]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [filename, evidenceType]
 *             properties:
 *               filename: { type: string, example: calibration-certificate-meter-001.pdf }
 *               evidenceType: { type: string, example: CALIBRATION_CERTIFICATE }
 *     responses:
 *       200:
 *         description: Upload token with evidenceId and blob URL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     evidenceId: { type: string }
 *                     blobUrl: { type: string }
 *                     expiresAt: { type: string, format: date-time }
 */
router.post('/:projectId/evidence/upload-token', authenticateToken,
  requirePermission('mrv:evidence:write'),
  verifyMRVProjectAccess(['mrv-project-manager', 'mrv-field-officer', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'EVIDENCE_UPLOAD_TOKEN_GENERATED', entityType: 'ExternalEvidenceRecord', getEntityId: (req, body) => body?.data?.evidenceId }),
  async (req, res) => {
  try {
    const { filename, evidenceType } = req.body;
    if (!filename || !evidenceType) return res.status(400).json({ error: 'filename and evidenceType are required' });
    const evidenceId = `EVD-${uuidv4()}`;
    const tokenResult = await generateUploadToken({ projectId: req.params.projectId, evidenceId, filename });
    res.json({ success: true, data: { evidenceId, ...tokenResult } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Manual Observations ───────────────────────────────────────────────────

/**
 * @swagger
 * /api/mrv/projects/{projectId}/manual-observations:
 *   get:
 *     summary: List manual meter readings and key-value observations
 *     description: Returns all manually submitted observations (electricity meter readings, fuel purchases, survey values, etc.)
 *     tags: [MRV Engine - Evidence and Ingest]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: monitoringPeriodId
 *         schema: { type: string }
 *       - in: query
 *         name: parameterId
 *         schema: { type: string, description: "Filter by parameter ID" }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING_REVIEW, APPROVED, REJECTED, SUPERSEDED] }
 *     responses:
 *       200:
 *         description: Manual observations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { type: object } }
 */
router.get('/:projectId/manual-observations', authenticateToken, requirePermission('mrv:evidence:read'), verifyMRVProjectAccess(), async (req, res) => {
  try {
    const filter = { projectId: req.params.projectId };
    if (req.query.monitoringPeriodId) filter.monitoringPeriodId = req.query.monitoringPeriodId;
    if (req.query.parameterId) filter.parameterId = req.query.parameterId;
    if (req.query.status) filter.status = req.query.status;
    const obs = await ManualObservation.find(filter).sort({ observedAt: -1 }).lean();
    res.json({ success: true, data: obs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/manual-observations:
 *   post:
 *     summary: Submit a manual meter reading or key-value observation
 *     description: |
 *       Submit a manual reading. For VM0050 electricity meter readings use:
 *       - `parameterId`: `VERRA-VM0050-PARAM-PROJECT-ELECTRICITY-CONSUMPTION`
 *       - `sourceType`: `MANUAL_METER_READING`
 *       - `readingType`: `CUMULATIVE` (for a running meter) or `INCREMENTAL` (for a period delta)
 *
 *       All manual observations start in `PENDING_REVIEW` and must be approved by an `mrv-data-reviewer`.
 *     tags: [MRV Engine - Evidence and Ingest]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ManualObservationRequest' }
 *           examples:
 *             electricity_meter:
 *               summary: Cumulative electricity meter reading
 *               value:
 *                 parameterId: VERRA-VM0050-PARAM-PROJECT-ELECTRICITY-CONSUMPTION
 *                 parameterName: Project electricity consumption
 *                 value: 1250.4
 *                 unit: kWh
 *                 observedAt: "2026-03-31T18:00:00Z"
 *                 sourceType: MANUAL_METER_READING
 *                 readingType: CUMULATIVE
 *                 monitoringPeriodId: "MP-LZKJ3MN-abc123"
 *                 siteId: "SITE-uuid-here"
 *                 meterAssetId: "METER-001"
 *                 previousReadingId: "MOBS-previous-uuid"
 *                 previousValue: 1125.0
 *     responses:
 *       201:
 *         description: Manual observation created in PENDING_REVIEW
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: object }
 *       400: { description: parameterId, value, unit, observedAt, sourceType are required }
 *       403: { description: Requires mrv-field-officer, mrv-project-manager, or mrv-programme-admin }
 */
router.post('/:projectId/manual-observations', authenticateToken,
  requirePermission('mrv:evidence:write'),
  verifyMRVProjectAccess(['mrv-field-officer', 'mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'MANUAL_OBSERVATION_SUBMITTED', entityType: 'ManualObservation', getEntityId: (req, body) => body?.data?.manualObservationId }),
  async (req, res) => {
  try {
    const { parameterId, parameterName, value, unit, observedAt, sourceType, readingType, monitoringPeriodId, siteId, meterAssetId, previousReadingId, previousValue, attributes, notes } = req.body;
    if (!parameterId || value === undefined || !unit || !observedAt || !sourceType) return res.status(400).json({ error: 'parameterId, value, unit, observedAt, sourceType are required' });
    const obs = await ManualObservation.create({ manualObservationId: `MOBS-${uuidv4()}`, projectId: req.params.projectId, organizationId: req.mrvProject.organizationId, monitoringPeriodId, siteId, parameterId, parameterName, value, unit, observedAt: new Date(observedAt), sourceType, readingType: readingType || 'INSTANTANEOUS', meterAssetId, previousReadingId, previousValue, attributes: attributes || {}, notes, operatorId: req.user?.userid, status: 'PENDING_REVIEW' });
    res.status(201).json({ success: true, data: obs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/manual-observations/{observationId}/approve:
 *   post:
 *     summary: Approve a manual observation (PENDING_REVIEW → APPROVED)
 *     description: Reviewer approves the manual reading. Requires role `mrv-data-reviewer`, `mrv-project-manager`, or `mrv-programme-admin`.
 *     tags: [MRV Engine - Evidence and Ingest]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: observationId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes: { type: string, description: "Optional reviewer notes" }
 *     responses:
 *       200:
 *         description: Observation approved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: object }
 *       404: { description: Observation not found or not in PENDING_REVIEW status }
 */
router.post('/:projectId/manual-observations/:observationId/approve', authenticateToken,
  requirePermission('mrv:evidence:write'),
  verifyMRVProjectAccess(['mrv-data-reviewer', 'mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'MANUAL_OBSERVATION_APPROVED', entityType: 'ManualObservation', getEntityId: (req) => req.params.observationId }),
  async (req, res) => {
  try {
    const obs = await ManualObservation.findOneAndUpdate({ manualObservationId: req.params.observationId, projectId: req.params.projectId, status: 'PENDING_REVIEW' }, { $set: { status: 'APPROVED', approvedBy: req.user?.userid, approvedAt: new Date(), updatedAt: new Date() } }, { new: true });
    if (!obs) return res.status(404).json({ error: 'Observation not found or not in PENDING_REVIEW status' });
    res.json({ success: true, data: obs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Sensor Installations ──────────────────────────────────────────────────

/**
 * @swagger
 * /api/mrv/projects/{projectId}/installations:
 *   get:
 *     summary: List sensor installations for a project
 *     description: |
 *       Returns all devices linked to this MRV project as sensor installations.
 *       Filter by `status` to find ACTIVE devices, devices in MAINTENANCE, or historical records.
 *
 *       **Status lifecycle:**
 *       - `PLANNED` → registered but not physically installed yet
 *       - `ACTIVE` → collecting data for the project
 *       - `MAINTENANCE` → temporarily offline (calibration, firmware update, repair)
 *       - `REPLACED` → permanently swapped out; `replacedByInstallationId` points to successor
 *       - `DECOMMISSIONED` → project closed; all data collection ended
 *     tags: [MRV Engine - Evidence and Ingest]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PLANNED, ACTIVE, MAINTENANCE, REPLACED, DECOMMISSIONED] }
 *         description: Filter by installation status
 *       - in: query
 *         name: siteId
 *         schema: { type: string }
 *         description: Filter by site
 *       - in: query
 *         name: auid
 *         schema: { type: string }
 *         description: Filter by device auid
 *     responses:
 *       200:
 *         description: Sensor installations list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 count: { type: integer }
 *                 data: { type: array, items: { type: object } }
 */
router.get('/:projectId/installations', authenticateToken, requirePermission('mrv:evidence:read'), verifyMRVProjectAccess(), async (req, res) => {
  try {
    const { status, siteId, auid } = req.query;
    const filter = { projectId: req.params.projectId };
    if (status) filter.status = status;
    if (siteId) filter.siteId = siteId;
    if (auid)   filter.auid   = auid;
    const installations = await SensorInstallation.find(filter).sort({ _id: -1 }).lean();
    res.json({ success: true, count: installations.length, data: installations });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/installations:
 *   post:
 *     summary: Link an existing registered device to this MRV project
 *     description: |
 *       Links a device (by `auid`) to this MRV project as a sensor installation.
 *
 *       **Business Rules enforced:**
 *       1. Device must exist and belong to the **same organization** as the project
 *       2. Device model is checked against the project's methodology sensor capability map
 *       3. Device cannot already have an ACTIVE/MAINTENANCE installation on this project+site
 *       4. Project must not be CLOSED, COMPLETED, or ARCHIVED
 *
 *       **What happens on success:**
 *       - `SensorInstallation` record created with `status: ACTIVE`
 *       - Device record updated: `mrvEnabled: true`, `retentionClass: MRV`
 *       - Device added to `mrvProjectAssignments` array
 *       - Audit event logged
 *
 *       **Removal rules:** Installations are **never deleted**. To take a device offline:
 *       - Temporary: use `PATCH .../maintenance` (device returns later)
 *       - Permanent swap: use `POST .../replace` (new device takes over, old record preserved)
 *       - Project end: automatic decommission when project closes
 *     tags: [MRV Engine - Evidence and Ingest]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *         example: CC-SANDBOX-CLEAN-COOKING-001
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [auid]
 *             properties:
 *               auid:
 *                 type: string
 *                 description: The device's unique AUID (must already be registered in the system)
 *                 example: sandbox-gas-solo-001
 *               siteId:
 *                 type: string
 *                 description: Site within this project where the device is installed
 *                 example: SITE-SANDBOX-ACCRA-001
 *               validFrom:
 *                 type: string
 *                 format: date-time
 *                 description: When the device started collecting data for this project (defaults to now)
 *               coordinates:
 *                 type: array
 *                 items: { type: number }
 *                 description: "[longitude, latitude] of the physical sensor"
 *                 example: [-0.187, 5.6037]
 *               positionDescription:
 *                 type: string
 *                 description: Human-readable location description
 *                 example: Indoor kitchen, household cluster A, building 3
 *               expectedFrequencySeconds:
 *                 type: integer
 *                 description: Expected telemetry frequency in seconds (used for gap detection)
 *                 example: 3600
 *               installationNotes:
 *                 type: string
 *                 description: Field engineer installation notes
 *           examples:
 *             link_gas_solo:
 *               summary: Link a Gas Solo device to sandbox project
 *               value:
 *                 auid: sandbox-gas-solo-001
 *                 siteId: SITE-SANDBOX-ACCRA-001
 *                 positionDescription: Indoor kitchen — household cluster A, Accra pilot site
 *                 coordinates: [-0.187, 5.6037]
 *                 expectedFrequencySeconds: 3600
 *     responses:
 *       201:
 *         description: Device successfully linked to project
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 installationId: { type: string }
 *                 data: { type: object }
 *       400: { description: Missing required fields }
 *       403: { description: Device belongs to a different organization OR insufficient role }
 *       404: { description: Device or project not found }
 *       409: { description: Device already has an active installation on this project OR project is closed }
 */
router.post('/:projectId/installations', authenticateToken,
  requirePermission('mrv:evidence:write'),
  verifyMRVProjectAccess(['mrv-project-manager', 'mrv-programme-admin', 'mrv-field-officer']),
  mrvAuditEvent({ action: 'DEVICE_LINKED', entityType: 'SensorInstallation', getEntityId: (req, body) => body?.data?.installationId || body?.installationId }),
  async (req, res) => {
  try {
    const { auid } = req.body;
    if (!auid) return res.status(400).json({ error: 'auid is required — provide the device AUID to link' });
    const installation = await installationSvc.linkDevice(
      req.params.projectId,
      auid,
      req.body,
      req.user.userid
    );
    res.status(201).json({ success: true, installationId: installation.installationId, data: installation });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/installations/{installationId}:
 *   get:
 *     summary: Get a single installation record with full history
 *     tags: [MRV Engine - Evidence and Ingest]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: installationId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Installation record
 *       404: { description: Installation not found }
 */
router.get('/:projectId/installations/:installationId', authenticateToken, requirePermission('mrv:evidence:read'), verifyMRVProjectAccess(), async (req, res) => {
  try {
    const inst = await installationSvc.getInstallation(req.params.installationId);
    if (inst.projectId !== req.params.projectId) return res.status(404).json({ error: 'Installation not found on this project' });
    res.json({ success: true, data: inst });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/installations/{installationId}/maintenance:
 *   patch:
 *     summary: Put a device into MAINTENANCE mode (temporary offline)
 *     description: |
 *       Use this when a device needs to go offline temporarily for calibration, firmware update,
 *       physical repair, or relocation. A data gap will be expected and documented.
 *
 *       The device remains linked to the project. When maintenance is complete,
 *       call `PATCH .../maintenance/return` to bring it back to ACTIVE.
 *
 *       **Cannot be used on REPLACED or DECOMMISSIONED installations.**
 *     tags: [MRV Engine - Evidence and Ingest]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: installationId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Why is the device going into maintenance?
 *                 example: Scheduled annual calibration — device being sent to lab
 *               expectedReturnDate:
 *                 type: string
 *                 format: date
 *                 description: When do you expect the device back online?
 *                 example: '2026-07-01'
 *               notes:
 *                 type: string
 *     responses:
 *       200: { description: Device put into MAINTENANCE mode }
 *       409: { description: Installation is not ACTIVE or project is closed }
 *       404: { description: Installation not found }
 */
router.patch('/:projectId/installations/:installationId/maintenance', authenticateToken,
  requirePermission('mrv:evidence:write'),
  verifyMRVProjectAccess(['mrv-project-manager', 'mrv-programme-admin', 'mrv-field-officer']),
  mrvAuditEvent({ action: 'DEVICE_MAINTENANCE_START', entityType: 'SensorInstallation', getEntityId: (req) => req.params.installationId }),
  async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'reason is required' });
    const installation = await installationSvc.startMaintenance(
      req.params.installationId,
      req.body,
      req.user.userid
    );
    res.json({ success: true, message: 'Device put into MAINTENANCE mode — data gap will be documented', data: installation });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/installations/{installationId}/maintenance/return:
 *   patch:
 *     summary: Return a device from MAINTENANCE back to ACTIVE
 *     description: Use this when maintenance is complete and the device is reinstalled and collecting data again.
 *     tags: [MRV Engine - Evidence and Ingest]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: installationId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes: { type: string, description: Any notes about the return from maintenance }
 *     responses:
 *       200: { description: Device returned to ACTIVE }
 *       409: { description: Installation is not in MAINTENANCE }
 */
router.patch('/:projectId/installations/:installationId/maintenance/return', authenticateToken,
  requirePermission('mrv:evidence:write'),
  verifyMRVProjectAccess(['mrv-project-manager', 'mrv-programme-admin', 'mrv-field-officer']),
  mrvAuditEvent({ action: 'DEVICE_MAINTENANCE_RETURN', entityType: 'SensorInstallation', getEntityId: (req) => req.params.installationId }),
  async (req, res) => {
  try {
    const installation = await installationSvc.endMaintenance(
      req.params.installationId,
      req.body,
      req.user.userid
    );
    res.json({ success: true, message: 'Device returned to ACTIVE — data collection resumed', data: installation });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/installations/{installationId}/replace:
 *   post:
 *     summary: Replace a device with a different device (permanent swap)
 *     description: |
 *       Use this when a device is faulty, damaged, stolen, or being upgraded and will not return.
 *
 *       **What happens:**
 *       - Old installation: `status → REPLACED`, `validTo` set to now, `replacedByInstallationId` set
 *       - New installation: created as `ACTIVE` with the replacement device
 *       - **Both records are permanently preserved** for audit trail and continuity of evidence
 *       - New device gets `mrvEnabled: true` and `retentionClass: MRV`
 *
 *       **Requires:** The new device must already be registered in the system and belong to the same organization.
 *     tags: [MRV Engine - Evidence and Ingest]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: installationId
 *         required: true
 *         schema: { type: string }
 *         description: The installation being replaced
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newAuid, reason]
 *             properties:
 *               newAuid:
 *                 type: string
 *                 description: AUID of the replacement device (must already be registered)
 *                 example: env-sensor-replacement-001
 *               reason:
 *                 type: string
 *                 enum: [FAULT, CALIBRATION_FAILURE, UPGRADE, THEFT, DAMAGE, OTHER]
 *                 example: FAULT
 *               notes:
 *                 type: string
 *                 description: Detailed reason for replacement
 *               positionDescription:
 *                 type: string
 *                 description: Position of the new device (defaults to old device position if not provided)
 *     responses:
 *       201:
 *         description: Device replaced — old and new installation records returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 oldInstallation: { type: object, description: Closed installation record (status REPLACED) }
 *                 newInstallation: { type: object, description: New active installation record }
 *       400: { description: newAuid and reason are required }
 *       403: { description: Replacement device belongs to a different organization }
 *       404: { description: Old installation or replacement device not found }
 *       409: { description: Cannot replace a REPLACED or DECOMMISSIONED installation }
 */
router.post('/:projectId/installations/:installationId/replace', authenticateToken,
  requirePermission('mrv:evidence:write'),
  verifyMRVProjectAccess(['mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'DEVICE_REPLACED', entityType: 'SensorInstallation', getEntityId: (req) => req.params.installationId }),
  async (req, res) => {
  try {
    const { newAuid, reason } = req.body;
    if (!newAuid || !reason) return res.status(400).json({ error: 'newAuid and reason are required' });
    const result = await installationSvc.replaceDevice(
      req.params.installationId,
      newAuid,
      req.body,
      req.user.userid
    );
    res.status(201).json({
      success: true,
      message: `Device ${result.oldInstallation.auid} replaced by ${newAuid} — both records preserved for audit trail`,
      oldInstallation: result.oldInstallation,
      newInstallation: result.newInstallation
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── Calibration Records ───────────────────────────────────────────────────

/**
 * @swagger
 * /api/mrv/projects/{projectId}/calibrations:
 *   get:
 *     summary: List calibration records for devices in this project
 *     tags: [MRV Engine - Evidence and Ingest]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Calibration records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { type: object } }
 */
router.get('/:projectId/calibrations', authenticateToken, requirePermission('mrv:evidence:read'), verifyMRVProjectAccess(), async (req, res) => {
  try {
    const cals = await CalibrationRecord.find({ projectId: req.params.projectId }).lean();
    res.json({ success: true, data: cals });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/calibrations:
 *   post:
 *     summary: Register a sensor or meter calibration record
 *     description: Records a calibration event with traceability information. Link the calibration certificate using `certificateEvidenceId` from a previously uploaded evidence file.
 *     tags: [MRV Engine - Evidence and Ingest]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CalibrationRecordRequest' }
 *     responses:
 *       201:
 *         description: Calibration record created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: object }
 */
router.post('/:projectId/calibrations', authenticateToken,
  requirePermission('mrv:evidence:write'),
  verifyMRVProjectAccess(['mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'CALIBRATION_RECORDED', entityType: 'CalibrationRecord', getEntityId: (req, body) => body?.data?.calibrationId }),
  async (req, res) => {
  try {
    const cal = await CalibrationRecord.create({ calibrationId: `CAL-${uuidv4()}`, projectId: req.params.projectId, ...req.body, createdBy: req.user?.userid });
    res.status(201).json({ success: true, data: cal });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CSV Imports ───────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/mrv/projects/{projectId}/csv-imports:
 *   get:
 *     summary: List CSV import records for a project
 *     tags: [MRV Engine - Evidence and Ingest]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: CSV import records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { type: object } }
 */
router.get('/:projectId/csv-imports', authenticateToken, requirePermission('mrv:evidence:read'), verifyMRVProjectAccess(), async (req, res) => {
  try {
    const imports = await CSVImport.find({ projectId: req.params.projectId }).sort({ uploadedAt: -1 }).lean();
    res.json({ success: true, data: imports });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/csv-imports:
 *   post:
 *     summary: Upload a CSV file for bulk manual observation import
 *     description: Upload a CSV file. The file is stored in blob storage and a CSVImport record is created in UPLOADED status. Review the import and commit using the /commit endpoint (Phase 2).
 *     tags: [MRV Engine - Evidence and Ingest]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               monitoringPeriodId: { type: string }
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: CSV file with manual observation data
 *     responses:
 *       201:
 *         description: CSV uploaded — review before committing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: object }
 *                 message: { type: string, example: "CSV uploaded. Use /commit endpoint after reviewing preview." }
 */
router.post('/:projectId/csv-imports', authenticateToken,
  requirePermission('mrv:evidence:write'),
  verifyMRVProjectAccess(['mrv-field-officer', 'mrv-project-manager', 'mrv-programme-admin']),
  upload.single('file'),
  mrvAuditEvent({ action: 'CSV_IMPORT_SUBMITTED', entityType: 'CSVImport', getEntityId: (req, body) => body?.data?.importId || body?.importId }),
  async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'CSV file is required (multipart field: file)' });
    const { parseCSVPreview } = require('../../services/mrv/mrvCsvImportService');
    const preview = await parseCSVPreview(
      req.params.projectId,
      req.body.monitoringPeriodId || null,
      req.file.buffer,
      req.file.originalname,
      req.user.userid
    );
    res.status(201).json({
      success: true,
      importId: preview.importId,
      message: 'CSV parsed. Review the column mapping, then POST to /csv-imports/:importId/commit',
      data: preview,
    });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/csv-imports/{importId}/commit:
 *   post:
 *     summary: Commit a CSV import — create ManualObservation records from mapped columns
 *     description: |
 *       After reviewing the preview from `POST /csv-imports`, confirm the column mapping
 *       and commit the import. This creates one ManualObservation record per valid data row.
 *
 *       **columnMapping format:**
 *       ```json
 *       { "Timestamp": "observedAt", "DeviceID": "auid", "CO2_ppm": "equivalent_co2", "kWh": "electricity_kwh" }
 *       ```
 *       Keys are CSV column headers. Values are MRV parameter names.
 *       At minimum, a timestamp column mapped to `observedAt` is required.
 *
 *       Rows with invalid or missing timestamps are skipped and reported in the response.
 *     tags: [MRV Engine - Evidence and Ingest]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: importId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [columnMapping]
 *             properties:
 *               columnMapping:
 *                 type: object
 *                 description: Maps CSV column headers to MRV parameter names
 *                 example:
 *                   Timestamp: observedAt
 *                   SensorID: auid
 *                   CO2_Equivalent: equivalent_co2
 *                   Electricity_kWh: electricity_kwh
 *     responses:
 *       200:
 *         description: Import committed — ManualObservation records created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 committed: { type: integer, description: Number of observations created }
 *                 skipped: { type: integer, description: Number of rows skipped due to errors }
 *                 observationIds: { type: array, items: { type: string } }
 *                 skippedDetails: { type: array, items: { type: object } }
 *       400: { description: columnMapping missing or no observedAt mapping }
 *       404: { description: Import not found }
 *       409: { description: Import already committed }
 */
router.post('/:projectId/csv-imports/:importId/commit', authenticateToken,
  requirePermission('mrv:evidence:write'),
  verifyMRVProjectAccess(['mrv-field-officer', 'mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'CSV_IMPORT_COMMITTED', entityType: 'CSVImport', getEntityId: (req) => req.params.importId }),
  async (req, res) => {
  try {
    const { columnMapping } = req.body;
    if (!columnMapping) return res.status(400).json({ error: 'columnMapping is required' });
    const { commitCSVImport } = require('../../services/mrv/mrvCsvImportService');
    const result = await commitCSVImport(req.params.importId, columnMapping, req.user.userid);
    res.json({
      success:        true,
      message:        `${result.committed} observation(s) created from CSV import`,
      committed:      result.committed,
      skipped:        result.skipped.length,
      observationIds: result.observationIds,
      skippedDetails: result.skipped,
    });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});


// ── Telemetry Receipts ────────────────────────────────────────────────────

/**
 * @swagger
 * /api/mrv/projects/{projectId}/receipts:
 *   get:
 *     summary: List telemetry ingest receipts for a project
 *     description: |
 *       Returns the MRV ingestion log — one record per telemetry event received from devices
 *       assigned to this project. Each receipt shows the ingestion status and blob storage path.
 *     tags: [MRV Engine - Evidence and Ingest]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, STORED, OBSERVATION_CREATED, VALIDATED, DUPLICATE, UNRESOLVED, QUARANTINED, FAILED] }
 *       - in: query
 *         name: auid
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Paginated telemetry receipts
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MRVListResponse' }
 */
router.get('/:projectId/receipts', authenticateToken, requirePermission('mrv:evidence:read'), verifyMRVProjectAccess(), async (req, res) => {
  try {
    const { page = 1, limit = 50, status, auid } = req.query;
    const filter = { projectIds: req.params.projectId };
    if (status) filter.status = status;
    if (auid) filter.auid = auid;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [receipts, total] = await Promise.all([
      TelemetryReceipt.find(filter).sort({ receivedAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      TelemetryReceipt.countDocuments(filter)
    ]);
    res.json({ success: true, data: receipts, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
