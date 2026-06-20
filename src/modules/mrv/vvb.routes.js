'use strict';
const router = require('express').Router({ mergeParams: true });
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const authenticateToken      = require('../../middleware/bearermiddleware');
const requireMRVSubscription = require('../../middleware/mrv/requireMRVSubscription');
const requireVVBAccess       = require('../../middleware/mrv/requireVVBAccess');
const MRVVVBAccessGrant      = require('../../models/mrv/assurance/MRVVVBAccessGrant.model');
const MRVObservation         = require('../../models/mrv/evidence/MRVObservation.model');
const ExternalEvidenceRecord = require('../../models/mrv/evidence/ExternalEvidenceRecord.model');
const SensorInstallation     = require('../../models/mrv/evidence/SensorInstallation.model');
const CalibrationRecord      = require('../../models/mrv/evidence/CalibrationRecord.model');
const VerificationCase       = require('../../models/mrv/assurance/VerificationCase.model');
const VerificationFinding    = require('../../models/mrv/assurance/VerificationFinding.model');
const MRVProject             = require('../../models/mrv/project/MRVProject.model');
const MonitoringPeriod       = require('../../models/mrv/monitoring/MonitoringPeriod.model');
const { createAuditLog }     = require('../../utils/auditLogger');

const ok  = (res, data) => res.json({ success: true, ...data });
const err = (res, e, code = 500) => res.status(code).json({ success: false, error: e.message });

// ── SECTION A: Project Owner — manage VVB access grants ──────────────────────
const ownerRouter = require('express').Router({ mergeParams: true });
ownerRouter.use(authenticateToken, requireMRVSubscription);

/**
 * @swagger
 * /api/mrv/projects/{projectId}/vvb-access:
 *   post:
 *     summary: Issue a VVB access key for a project
 *     description: >
 *       Issues a scoped, time-limited API key for a Validation/Verification Body (VVB).
 *       The raw key is returned ONCE and is not stored in plaintext. The DB stores only a SHA-256 hash.
 *     tags: [MRV VVB]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               vvbName:    { type: string }
 *               vvbEmail:   { type: string }
 *               expiryDays: { type: integer, default: 90 }
 *     responses:
 *       200:
 *         description: VVB access key issued
 */
ownerRouter.post('/:projectId/vvb-access', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { vvbName, vvbEmail, expiryDays = 90 } = req.body;

    const rawKey    = `vvb_${crypto.randomBytes(32).toString('hex')}`;
    const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    const grant = await MRVVVBAccessGrant.create({
      grantId:        `VVB-${uuidv4()}`,
      projectId,
      organizationId: req.user?.organizationId || req.user?.currentOrganizationId || req.headers['x-org-id'] || '',
      apiKey:         hashedKey,
      apiKeyPrefix:   rawKey.slice(0, 10),
      vvbName:        vvbName  || '',
      vvbEmail:       vvbEmail || '',
      issuedBy:       req.user?.userid || 'unknown',
      expiresAt
    });

    await createAuditLog({
      action:  'VVB_ACCESS_GRANT_ISSUED',
      userid:  req.user?.userid,
      details: { grantId: grant.grantId, projectId, vvbName, vvbEmail, expiresAt }
    });

    // Return the raw key ONCE — never stored in plaintext
    ok(res, {
      message:      'VVB access key issued. Store this key securely — it will not be shown again.',
      grantId:      grant.grantId,
      apiKey:       rawKey,          // shown once only
      apiKeyPrefix: grant.apiKeyPrefix,
      expiresAt,
      scope:        grant.scope
    });
  } catch (e) { err(res, e); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/vvb-access:
 *   get:
 *     summary: List VVB access grants for a project
 *     tags: [MRV VVB]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of grants (hashed key never returned)
 */
ownerRouter.get('/:projectId/vvb-access', async (req, res) => {
  try {
    const grants = await MRVVVBAccessGrant.find({ projectId: req.params.projectId })
      .select('-apiKey') // never return the hash
      .sort({ _id: -1 })
      .lean();
    ok(res, { grants });
  } catch (e) { err(res, e); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/vvb-access/{grantId}/revoke:
 *   post:
 *     summary: Revoke a VVB access grant
 *     tags: [MRV VVB]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: grantId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Grant revoked
 *       404:
 *         description: Grant not found
 */
ownerRouter.post('/:projectId/vvb-access/:grantId/revoke', async (req, res) => {
  try {
    const grant = await MRVVVBAccessGrant.findOne({
      grantId:   req.params.grantId,
      projectId: req.params.projectId
    });
    if (!grant) return res.status(404).json({ success: false, error: 'Grant not found' });

    grant.status    = 'REVOKED';
    grant.revokedAt = new Date();
    grant.revokedBy = req.user?.userid;
    await grant.save();

    await createAuditLog({
      action:  'VVB_ACCESS_GRANT_REVOKED',
      userid:  req.user?.userid,
      details: { grantId: grant.grantId, projectId: grant.projectId }
    });

    ok(res, { message: 'VVB access grant revoked.' });
  } catch (e) { err(res, e); }
});

// ── SECTION B: VVB Verifier — read-only data room ─────────────────────────────
const vvbRouter = require('express').Router({ mergeParams: true });
vvbRouter.use(requireVVBAccess);

// Block all non-GET methods (router.use with no path = applies to all routes, no path-to-regexp needed)
vvbRouter.use((req, res, next) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'VVB data room is read-only.' });
  }
  next();
});

/**
 * @swagger
 * /api/vvb/{projectId}/package:
 *   get:
 *     summary: Full project data package for verifier review
 *     description: >
 *       Returns a complete snapshot of all MRV data for the project:
 *       project details, monitoring periods, observations (up to 5000), evidence files,
 *       sensor installations, calibration records, and verification cases.
 *     tags: [MRV VVB]
 *     security: [{ vvbKeyAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Full data package
 */
vvbRouter.get('/:projectId/package', async (req, res) => {
  try {
    const { projectId } = req.params;
    const [
      project,
      periods,
      observations,
      evidence,
      installations,
      calibrations,
      verificationCases
    ] = await Promise.all([
      MRVProject.findOne({ projectId }).lean(),
      MonitoringPeriod.find({ projectId }).lean(),
      MRVObservation.find({ projectId }).limit(5000).lean(),
      ExternalEvidenceRecord.find({ projectId }).lean(),
      SensorInstallation.find({ projectId }).lean(),
      CalibrationRecord.find({ projectId }).lean(),
      VerificationCase.find({ projectId }).lean()
    ]);

    ok(res, {
      packageGeneratedAt: new Date().toISOString(),
      project,
      monitoringPeriods: periods,
      observations: { count: observations.length, records: observations },
      evidence:     { count: evidence.length,      records: evidence },
      installations,
      calibrations,
      verificationCases
    });
  } catch (e) { err(res, e); }
});

/**
 * @swagger
 * /api/vvb/{projectId}/observations:
 *   get:
 *     summary: Paginated observations for verifier review
 *     tags: [MRV VVB]
 *     security: [{ vvbKeyAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *           maximum: 200
 *       - in: query
 *         name: mpId
 *         schema:
 *           type: string
 *         description: Filter by monitoring period ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by qualityStatus
 *     responses:
 *       200:
 *         description: Paginated observations
 */
vvbRouter.get('/:projectId/observations', async (req, res) => {
  try {
    const { projectId } = req.params;
    const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 100);
    const skip  = (page - 1) * limit;

    const filter = { projectId };
    if (req.query.mpId)   filter.monitoringPeriodId = req.query.mpId;
    if (req.query.status) filter.qualityStatus      = req.query.status;

    const [records, total] = await Promise.all([
      MRVObservation.find(filter).sort({ observedAt: -1 }).skip(skip).limit(limit).lean(),
      MRVObservation.countDocuments(filter)
    ]);

    ok(res, {
      observations: records,
      total,
      page,
      pages: Math.ceil(total / limit),
      limit
    });
  } catch (e) { err(res, e); }
});

/**
 * @swagger
 * /api/vvb/{projectId}/evidence-files:
 *   get:
 *     summary: Evidence file list for verifier review
 *     tags: [MRV VVB]
 *     security: [{ vvbKeyAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of evidence files (SAS tokens excluded)
 */
vvbRouter.get('/:projectId/evidence-files', async (req, res) => {
  try {
    const files = await ExternalEvidenceRecord.find({ projectId: req.params.projectId })
      .select('-largeFileUploadToken') // never expose SAS tokens
      .lean();
    ok(res, { evidenceFiles: files, count: files.length });
  } catch (e) { err(res, e); }
});

/**
 * @swagger
 * /api/vvb/{projectId}/audit-log:
 *   get:
 *     summary: Governance audit trail for verifier review
 *     description: >
 *       Returns the structured verification audit trail: all verification cases and
 *       their associated findings for the project.
 *     tags: [MRV VVB]
 *     security: [{ vvbKeyAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Verification cases and findings
 */
vvbRouter.get('/:projectId/audit-log', async (req, res) => {
  try {
    const [cases, findings] = await Promise.all([
      VerificationCase.find({ projectId: req.params.projectId }).lean(),
      VerificationFinding.find({ projectId: req.params.projectId }).lean()
    ]);
    ok(res, { verificationCases: cases, verificationFindings: findings });
  } catch (e) { err(res, e); }
});

/**
 * @swagger
 * /api/vvb/{projectId}/calibrations:
 *   get:
 *     summary: Calibration records for verifier review
 *     tags: [MRV VVB]
 *     security: [{ vvbKeyAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Calibration records
 */
vvbRouter.get('/:projectId/calibrations', async (req, res) => {
  try {
    const records = await CalibrationRecord.find({ projectId: req.params.projectId }).lean();
    ok(res, { calibrations: records, count: records.length });
  } catch (e) { err(res, e); }
});

/**
 * @swagger
 * /api/vvb/{projectId}/installations:
 *   get:
 *     summary: Sensor installation records for verifier review
 *     tags: [MRV VVB]
 *     security: [{ vvbKeyAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sensor installation records
 */
vvbRouter.get('/:projectId/installations', async (req, res) => {
  try {
    const records = await SensorInstallation.find({ projectId: req.params.projectId }).lean();
    ok(res, { installations: records, count: records.length });
  } catch (e) { err(res, e); }
});

// ── Export both sub-routers ───────────────────────────────────────────────────
module.exports = { ownerRouter, vvbRouter };
