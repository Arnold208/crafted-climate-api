'use strict';

const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const authenticateToken = require('../../middleware/bearermiddleware');
const { requirePermission } = require('../../middleware/authenticateApiKey');
const { verifyMRVProjectAccess } = require('../../middleware/mrv/verifyMRVProjectAccess');
const { mrvAuditEvent } = require('../../middleware/mrv/mrvAuditEvent');
const MRVAsset = require('../../models/mrv/project/MRVAsset.model');
const MRVSite = require('../../models/mrv/project/MRVSite.model');
const BaselineRecord = require('../../models/mrv/project/BaselineRecord.model');
const MonitoringPlan = require('../../models/mrv/project/MonitoringPlan.model');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function parseCsvRows(buffer) {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim());
    return headers.reduce((row, header, index) => {
      row[header] = values[index];
      return row;
    }, {});
  });
}

function boundaryFromRows(rows) {
  const coordinates = rows
    .map((row) => {
      const lat = Number(row.latitude || row.lat);
      const lng = Number(row.longitude || row.lng || row.lon);
      return Number.isFinite(lat) && Number.isFinite(lng) ? [lng, lat] : null;
    })
    .filter(Boolean);
  if (coordinates.length < 3) {
    const err = new Error('CSV boundary import requires at least three valid latitude/longitude rows');
    err.status = 400;
    throw err;
  }
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push(first);
  return { type: 'Polygon', coordinates: [coordinates] };
}

/**
 * @swagger
 * /api/mrv/projects/{projectId}/assets:
 *   get:
 *     summary: List MRV assets for a project
 *     tags: [MRV Engine - Projects]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: assetType
 *         schema: { type: string, enum: [COOKSTOVE, ENERGY_METER, FUEL_METER, SENSOR, GATEWAY, KITCHEN, PARTICIPANT_RECORD, OTHER] }
 *     responses:
 *       200:
 *         description: Project asset inventory
 */
router.get('/:projectId/assets', authenticateToken, requirePermission('mrv:projects:read'), verifyMRVProjectAccess(), async (req, res) => {
  try {
    const filter = { projectId: req.params.projectId };
    if (req.query.assetType) filter.assetType = req.query.assetType;
    const assets = await MRVAsset.find(filter).lean();
    assets.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    res.json({ success: true, data: assets });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/assets:
 *   post:
 *     summary: Create an MRV asset record
 *     tags: [MRV Engine - Projects]
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
 *             required: [assetType, name]
 *             properties:
 *               assetType: { type: string, enum: [COOKSTOVE, ENERGY_METER, FUEL_METER, SENSOR, GATEWAY, KITCHEN, PARTICIPANT_RECORD, OTHER] }
 *               name: { type: string }
 *               siteId: { type: string }
 *               serialNumber: { type: string }
 *               model: { type: string }
 *               manufacturer: { type: string }
 *               installedAt: { type: string, format: date }
 *               evidenceIds: { type: array, items: { type: string } }
 *               attributes: { type: object }
 *     responses:
 *       201:
 *         description: Asset created
 */
router.post('/:projectId/assets', authenticateToken,
  requirePermission('mrv:projects:write'),
  verifyMRVProjectAccess(['mrv-project-manager', 'mrv-field-officer', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'ASSET_CREATED', entityType: 'MRVAsset', getEntityId: (req, body) => body?.data?.assetId }),
  async (req, res) => {
    try {
      const { assetType, name } = req.body;
      if (!assetType || !name) return res.status(400).json({ error: 'assetType and name are required' });
      const asset = await MRVAsset.create({
        assetId: `AST-${uuidv4()}`,
        projectId: req.params.projectId,
        organizationId: req.mrvProject.organizationId,
        ...req.body,
        installedAt: req.body.installedAt ? new Date(req.body.installedAt) : undefined,
        createdBy: req.user?.userid,
      });
      res.status(201).json({ success: true, data: asset });
    } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
  }
);

/**
 * @swagger
 * /api/mrv/projects/{projectId}/sites/{siteId}/boundary-import:
 *   post:
 *     summary: Import a site boundary polygon from CSV
 *     description: CSV must contain latitude/longitude columns (`latitude,longitude` or `lat,lng`). The API stores the boundary as GeoJSON Polygon coordinates.
 *     tags: [MRV Engine - Projects]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: siteId
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
 *               file: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Site boundary updated
 */
router.post('/:projectId/sites/:siteId/boundary-import', authenticateToken,
  requirePermission('mrv:projects:write'),
  verifyMRVProjectAccess(['mrv-project-manager', 'mrv-field-officer', 'mrv-programme-admin']),
  upload.single('file'),
  mrvAuditEvent({ action: 'SITE_BOUNDARY_IMPORTED', entityType: 'MRVSite', getEntityId: (req) => req.params.siteId }),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'CSV file is required' });
      const rows = parseCsvRows(req.file.buffer);
      const boundary = boundaryFromRows(rows);
      const site = await MRVSite.findOneAndUpdate(
        { projectId: req.params.projectId, siteId: req.params.siteId, deletedAt: null },
        { $set: { boundary, updatedAt: new Date() } },
        { new: true }
      );
      if (!site) return res.status(404).json({ error: 'Site not found' });
      res.json({ success: true, data: site, importedPoints: boundary.coordinates[0].length });
    } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
  }
);

/**
 * @swagger
 * /api/mrv/projects/{projectId}/baseline:
 *   get:
 *     summary: List baseline records for a project
 *     tags: [MRV Engine - Projects]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Baseline records
 */
router.get('/:projectId/baseline', authenticateToken, requirePermission('mrv:projects:read'), verifyMRVProjectAccess(), async (req, res) => {
  try {
    const records = await BaselineRecord.find({ projectId: req.params.projectId }).lean();
    records.sort((a, b) => (b.version || 0) - (a.version || 0));
    res.json({ success: true, data: records });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/baseline:
 *   post:
 *     summary: Create or version a project baseline record
 *     tags: [MRV Engine - Projects]
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
 *             properties:
 *               baselineTechnology: { type: string }
 *               projectTechnology: { type: string }
 *               baselineFuel: { type: string }
 *               projectFuel: { type: string }
 *               householdCount: { type: number }
 *               sampleSize: { type: number }
 *               annualBaselineConsumption: { type: number }
 *               annualBaselineUnit: { type: string }
 *               evidenceIds: { type: array, items: { type: string } }
 *               assumptions: { type: object }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Baseline record created
 */
router.post('/:projectId/baseline', authenticateToken,
  requirePermission('mrv:projects:write'),
  verifyMRVProjectAccess(['mrv-project-manager', 'mrv-methodology-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'BASELINE_CREATED', entityType: 'BaselineRecord', getEntityId: (req, body) => body?.data?.baselineId }),
  async (req, res) => {
    try {
      const count = await BaselineRecord.countDocuments({ projectId: req.params.projectId });
      const record = await BaselineRecord.create({
        baselineId: `BASE-${uuidv4()}`,
        projectId: req.params.projectId,
        organizationId: req.mrvProject.organizationId,
        version: count + 1,
        ...req.body,
        createdBy: req.user?.userid,
      });
      res.status(201).json({ success: true, data: record });
    } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
  }
);

/**
 * @swagger
 * /api/mrv/projects/{projectId}/monitoring-plan:
 *   get:
 *     summary: List monitoring plan versions for a project
 *     tags: [MRV Engine - Projects]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Monitoring plan versions
 */
router.get('/:projectId/monitoring-plan', authenticateToken, requirePermission('mrv:projects:read'), verifyMRVProjectAccess(), async (req, res) => {
  try {
    const plans = await MonitoringPlan.find({ projectId: req.params.projectId }).lean();
    plans.sort((a, b) => (b.version || 0) - (a.version || 0));
    res.json({ success: true, data: plans });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/monitoring-plan:
 *   post:
 *     summary: Create or version a monitoring plan
 *     tags: [MRV Engine - Projects]
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
 *             properties:
 *               dataCollectionStart: { type: string, format: date }
 *               monitoringFrequency: { type: string, enum: [DAILY, WEEKLY, MONTHLY, QUARTERLY, PER_PERIOD] }
 *               requiredParameters: { type: array, items: { type: object } }
 *               evidenceRequirements: { type: array, items: { type: object } }
 *               missingDataProcedure: { type: string }
 *               qaQcProcedure: { type: string }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Monitoring plan created
 */
router.post('/:projectId/monitoring-plan', authenticateToken,
  requirePermission('mrv:projects:write'),
  verifyMRVProjectAccess(['mrv-project-manager', 'mrv-methodology-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'MONITORING_PLAN_CREATED', entityType: 'MonitoringPlan', getEntityId: (req, body) => body?.data?.monitoringPlanId }),
  async (req, res) => {
    try {
      const count = await MonitoringPlan.countDocuments({ projectId: req.params.projectId });
      const plan = await MonitoringPlan.create({
        monitoringPlanId: `MPLAN-${uuidv4()}`,
        projectId: req.params.projectId,
        organizationId: req.mrvProject.organizationId,
        version: count + 1,
        ...req.body,
        dataCollectionStart: req.body.dataCollectionStart ? new Date(req.body.dataCollectionStart) : undefined,
        createdBy: req.user?.userid,
      });
      res.status(201).json({ success: true, data: plan });
    } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
  }
);

module.exports = router;
