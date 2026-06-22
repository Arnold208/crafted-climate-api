'use strict';
const router = require('express').Router();
const authenticateToken = require('../../middleware/bearermiddleware');
const { requirePermission } = require('../../middleware/authenticateApiKey');
const MRVStandard = require('../../models/mrv/catalogue/MRVStandard.model');
const MRVStandardVersion = require('../../models/mrv/catalogue/MRVStandardVersion.model');
const MRVMethodology = require('../../models/mrv/catalogue/MRVMethodology.model');
const MRVMethodologyVersion = require('../../models/mrv/catalogue/MRVMethodologyVersion.model');
const MRVMethodologyImplementation = require('../../models/mrv/catalogue/MRVMethodologyImplementation.model');
const MRVSensorCapability = require('../../models/mrv/catalogue/MRVSensorCapability.model');
const MRVFactor = require('../../models/mrv/catalogue/MRVFactor.model');
const MRVFactorVersion = require('../../models/mrv/catalogue/MRVFactorVersion.model');

/**
 * @swagger
 * /api/mrv/catalogue/standards:
 *   get:
 *     summary: List all GHG programme standards
 *     description: Returns all active MRV standards seeded in the catalogue (e.g. Verra VCS). This is a read-only catalogue endpoint.
 *     tags: [MRV Engine - Catalogue]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: List of standards
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/MRVStandard' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MRVError401' }
 */
router.get('/standards', authenticateToken, requirePermission('mrv:catalogue:read'), async (req, res) => {
  try {
    const standards = await MRVStandard.find({ status: { $ne: 'ARCHIVED' } }).lean();
    res.json({ success: true, data: standards });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/catalogue/standards/{standardId}/versions:
 *   get:
 *     summary: List all versions for a specific standard
 *     description: Returns all versions (ACTIVE, TRANSITION, SUPERSEDED, WITHDRAWN) for the given standardId. Verra VCS has versions 4.7 and 5.0 seeded.
 *     tags: [MRV Engine - Catalogue]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: standardId
 *         required: true
 *         schema: { type: string, example: VERRA-VCS }
 *         description: The standard ID (e.g. VERRA-VCS)
 *     responses:
 *       200:
 *         description: List of standard versions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/MRVStandardVersion' }
 *       401:
 *         description: Unauthorized
 */
router.get('/standards/:standardId/versions', authenticateToken, requirePermission('mrv:catalogue:read'), async (req, res) => {
  try {
    const versions = await MRVStandardVersion.find({ standardId: req.params.standardId }).lean();
    res.json({ success: true, data: versions });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/catalogue/methodologies:
 *   get:
 *     summary: List methodologies, filterable by standardId and activityType
 *     description: |
 *       Returns all seeded methodologies. Filter by query params.
 *
 *       **Currently seeded:** VM0050, VM0051, VM0042, VMR0018, VM0044, VM0047, VM0033, VMR0016, VM0041, VM0032
 *     tags: [MRV Engine - Catalogue]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: standardId
 *         schema: { type: string, example: VERRA-VCS }
 *         description: Filter by standard (e.g. VERRA-VCS)
 *       - in: query
 *         name: activityType
 *         schema: { type: string, example: CLEAN_COOKING }
 *         description: Filter methodologies by activity type
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, WITHDRAWN, ARCHIVED] }
 *     responses:
 *       200:
 *         description: List of methodologies
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/MRVMethodology' }
 */
router.get('/methodologies', authenticateToken, requirePermission('mrv:catalogue:read'), async (req, res) => {
  try {
    const filter = {};
    if (req.query.standardId) filter.standardId = req.query.standardId;
    if (req.query.activityType) filter.activityTypes = req.query.activityType;
    if (req.query.status) filter.status = req.query.status;
    const methodologies = await MRVMethodology.find(filter).lean();
    res.json({ success: true, data: methodologies });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/catalogue/methodologies/{methodologyId}/versions:
 *   get:
 *     summary: List versions for a methodology
 *     tags: [MRV Engine - Catalogue]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: methodologyId
 *         required: true
 *         schema: { type: string, example: VERRA-VM0050 }
 *     responses:
 *       200:
 *         description: Methodology versions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { type: object } }
 */
router.get('/methodologies/:methodologyId/versions', authenticateToken, requirePermission('mrv:catalogue:read'), async (req, res) => {
  try {
    const versions = await MRVMethodologyVersion.find({ methodologyId: req.params.methodologyId }).lean();
    res.json({ success: true, data: versions });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/catalogue/implementations:
 *   get:
 *     summary: List Crafted Climate implementation records for methodologies
 *     description: |
 *       Shows the current implementation status of each methodology in the Crafted Climate platform.
 *
 *       **Key record to check:** `CC-VERRA-VM0050-1.0-1.0.0`
 *       - `status`: IMPLEMENTATION_IN_DEVELOPMENT
 *       - `mayCalculate`: false (blocked until 10 sign-off conditions met)
 *       - `requiresSignOffConditions`: lists all pending conditions
 *     tags: [MRV Engine - Catalogue]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: methodologyId
 *         schema: { type: string, example: VERRA-VM0050 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [CATALOGUED, REQUIREMENTS_MAPPING, IMPLEMENTATION_IN_DEVELOPMENT, INTERNAL_REVIEW, INTERNALLY_TESTED, APPROVED_FOR_PROJECT_DESIGN, SUSPENDED, SUPERSEDED, RETIRED] }
 *     responses:
 *       200:
 *         description: Implementation records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/MRVMethodologyImplementation' }
 */
router.get('/implementations', authenticateToken, requirePermission('mrv:catalogue:read'), async (req, res) => {
  try {
    const filter = {};
    if (req.query.methodologyId) filter.methodologyId = req.query.methodologyId;
    if (req.query.status) filter.status = req.query.status;
    const implementations = await MRVMethodologyImplementation.find(filter).lean();
    res.json({ success: true, data: implementations });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/catalogue/sensor-capabilities:
 *   get:
 *     summary: List sensor capability and methodology qualification mappings
 *     description: |
 *       Returns capability records for all sensor models, including their qualification
 *       for each methodology. Key rule for Gas Solo:
 *
 *       > **Gas Solo eCO2 is `SUPPORTING_EVIDENCE_ONLY` under VM0050 — NOT used for direct tCO2e quantification.**
 *     tags: [MRV Engine - Catalogue]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: model
 *         schema: { type: string, enum: [env, aqua, gas-solo, flow, terra, manual-meter, other] }
 *         description: Filter by sensor model
 *     responses:
 *       200:
 *         description: Sensor capabilities
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/MRVSensorCapability' }
 */
router.get('/sensor-capabilities', authenticateToken, requirePermission('mrv:catalogue:read'), async (req, res) => {
  try {
    const filter = {};
    if (req.query.model) filter.model = req.query.model;
    const caps = await MRVSensorCapability.find(filter).lean();
    res.json({ success: true, data: caps });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/catalogue/factors:
 *   get:
 *     summary: List emission factors (GEF, fuel factors, GWPs)
 *     tags: [MRV Engine - Catalogue]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: factorType
 *         schema: { type: string, example: GRID_EMISSION_FACTOR }
 *       - in: query
 *         name: country
 *         schema: { type: string, example: GH }
 *     responses:
 *       200:
 *         description: Emission factors
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { type: object } }
 */
router.get('/factors', authenticateToken, requirePermission('mrv:catalogue:read'), async (req, res) => {
  try {
    const filter = {};
    if (req.query.factorType) filter.factorType = req.query.factorType;
    if (req.query.country) filter.country = req.query.country;
    const factors = await MRVFactor.find(filter).lean();
    res.json({ success: true, data: factors });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/catalogue/factors/{factorId}/versions:
 *   get:
 *     summary: List versions for an emission factor
 *     tags: [MRV Engine - Catalogue]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: factorId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Factor versions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { type: object } }
 */
router.get('/factors/:factorId/versions', authenticateToken, requirePermission('mrv:catalogue:read'), async (req, res) => {
  try {
    const versions = await MRVFactorVersion.find({ factorId: req.params.factorId }).sort({ effectiveFrom: -1 }).lean();
    res.json({ success: true, data: versions });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
