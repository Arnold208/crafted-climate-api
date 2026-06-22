'use strict';
const router = require('express').Router();
const authenticateToken = require('../../middleware/bearermiddleware');
const { requirePermission } = require('../../middleware/authenticateApiKey');
const { verifyMRVProjectAccess } = require('../../middleware/mrv/verifyMRVProjectAccess');
const { mrvAuditEvent } = require('../../middleware/mrv/mrvAuditEvent');
const MRVObservation = require('../../models/mrv/evidence/MRVObservation.model');
const TelemetryReceipt = require('../../models/mrv/evidence/TelemetryReceipt.model');

/**
 * @swagger
 * /api/mrv/projects/{projectId}/data-quality/summary:
 *   get:
 *     summary: Get data quality summary statistics for a project or monitoring period
 *     description: Returns counts by quality status and the overall completeness ratio.
 *     tags: [MRV Engine - Data Quality]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: monitoringPeriodId
 *         schema: { type: string }
 *         description: Scope to a specific monitoring period
 *     responses:
 *       200:
 *         description: Data quality summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     total: { type: integer, example: 1440 }
 *                     accepted: { type: integer, example: 1380 }
 *                     acceptedWithWarning: { type: integer, example: 32 }
 *                     quarantined: { type: integer, example: 20 }
 *                     rejected: { type: integer, example: 5 }
 *                     voided: { type: integer, example: 3 }
 *                     manuallyApproved: { type: integer, example: 0 }
 *                     usable: { type: integer, example: 1412 }
 *                     completenessRatio: { type: number, format: float, example: 0.9806 }
 */
router.get('/:projectId/data-quality/summary', authenticateToken, requirePermission('mrv:data-quality:read'), verifyMRVProjectAccess(), async (req, res) => {
  try {
    const filter = { projectId: req.params.projectId };
    if (req.query.monitoringPeriodId) filter.monitoringPeriodId = req.query.monitoringPeriodId;
    const [total, accepted, acceptedWithWarning, quarantined, rejected, voided, manuallyApproved] = await Promise.all([
      MRVObservation.countDocuments(filter),
      MRVObservation.countDocuments({ ...filter, qualityStatus: 'ACCEPTED' }),
      MRVObservation.countDocuments({ ...filter, qualityStatus: 'ACCEPTED_WITH_WARNING' }),
      MRVObservation.countDocuments({ ...filter, qualityStatus: 'QUARANTINED' }),
      MRVObservation.countDocuments({ ...filter, qualityStatus: 'REJECTED' }),
      MRVObservation.countDocuments({ ...filter, qualityStatus: 'VOIDED' }),
      MRVObservation.countDocuments({ ...filter, qualityStatus: 'MANUALLY_APPROVED' })
    ]);
    const usable = accepted + acceptedWithWarning + manuallyApproved;
    res.json({ success: true, data: { total, accepted, acceptedWithWarning, quarantined, rejected, voided, manuallyApproved, usable, completenessRatio: total > 0 ? (usable / total) : 0 } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/data-quality/quarantined:
 *   get:
 *     summary: List quarantined observations awaiting manual review
 *     description: Returns all observations that failed QA/QC validation and require a reviewer decision (approve or void).
 *     tags: [MRV Engine - Data Quality]
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
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Quarantined observations
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MRVListResponse' }
 */
router.get('/:projectId/data-quality/quarantined', authenticateToken, requirePermission('mrv:data-quality:read'), verifyMRVProjectAccess(), async (req, res) => {
  try {
    const { page = 1, limit = 50, monitoringPeriodId } = req.query;
    const filter = { projectId: req.params.projectId, qualityStatus: 'QUARANTINED' };
    if (monitoringPeriodId) filter.monitoringPeriodId = monitoringPeriodId;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [obs, total] = await Promise.all([
      MRVObservation.find(filter).sort({ _id: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      MRVObservation.countDocuments(filter)
    ]);
    res.json({ success: true, data: obs, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/data-quality/observations/{observationId}/approve:
 *   post:
 *     summary: Manually approve a quarantined observation
 *     description: |
 *       Overrides the automated QA/QC result and marks the observation as `MANUALLY_APPROVED`.
 *       The observation will be included in completeness and calculation totals.
 *       Requires role: `mrv-data-reviewer`, `mrv-project-manager`, or `mrv-programme-admin`.
 *     tags: [MRV Engine - Data Quality]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: observationId
 *         required: true
 *         schema: { type: string, description: "The observationId (OBS-xxxx)" }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, description: "Reviewer justification for manual approval", example: "Clock drift expected — sensor replaced next day. Data is valid." }
 *     responses:
 *       200:
 *         description: Observation approved — status updated to MANUALLY_APPROVED
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/MRVObservation' }
 *       404: { description: Observation not found }
 *       403: { description: Requires mrv-data-reviewer or above }
 */
router.post('/:projectId/data-quality/observations/:observationId/approve', authenticateToken,
  requirePermission('mrv:data-quality:write'),
  verifyMRVProjectAccess(['mrv-data-reviewer', 'mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'OBSERVATION_APPROVED', entityType: 'MRVObservation', getEntityId: (req) => req.params.observationId }),
  async (req, res) => {
  try {
    const { reason } = req.body;
    const obs = await MRVObservation.findOneAndUpdate(
      { observationId: req.params.observationId, projectId: req.params.projectId },
      { $set: { qualityStatus: 'MANUALLY_APPROVED', manualReviewDecision: { decision: 'APPROVED', reason: reason || '', reviewedBy: req.user?.userid, reviewedAt: new Date() } } },
      { new: true }
    );
    if (!obs) return res.status(404).json({ error: 'Observation not found' });
    res.json({ success: true, data: obs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/data-quality/observations/{observationId}/void:
 *   post:
 *     summary: Void an observation — permanently excluded from calculations
 *     description: |
 *       Marks the observation as `VOIDED`. Voided observations are excluded from all
 *       completeness counts and calculation inputs. A `reason` is mandatory.
 *       Requires role: `mrv-data-reviewer`, `mrv-project-manager`, or `mrv-programme-admin`.
 *     tags: [MRV Engine - Data Quality]
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string, description: "Mandatory justification for voiding", example: "Sensor malfunction confirmed — readings invalid for entire 2-hour window." }
 *     responses:
 *       200:
 *         description: Observation voided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/MRVObservation' }
 *       400: { description: reason is required }
 *       404: { description: Observation not found }
 */
router.post('/:projectId/data-quality/observations/:observationId/void', authenticateToken,
  requirePermission('mrv:data-quality:write'),
  verifyMRVProjectAccess(['mrv-data-reviewer', 'mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'OBSERVATION_VOIDED', entityType: 'MRVObservation', getEntityId: (req) => req.params.observationId }),
  async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'reason is required for voiding an observation' });
    const obs = await MRVObservation.findOneAndUpdate(
      { observationId: req.params.observationId, projectId: req.params.projectId },
      { $set: { qualityStatus: 'VOIDED', manualReviewDecision: { decision: 'VOIDED', reason, reviewedBy: req.user?.userid, reviewedAt: new Date() } } },
      { new: true }
    );
    if (!obs) return res.status(404).json({ error: 'Observation not found' });
    res.json({ success: true, data: obs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/data-quality/unresolved-receipts:
 *   get:
 *     summary: List unresolved, quarantined, or failed ingest receipts
 *     description: Diagnostic endpoint — shows telemetry receipts that did not complete the full ingestion pipeline.
 *     tags: [MRV Engine - Data Quality]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Unresolved receipts (max 200)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/TelemetryReceipt' }
 */
router.get('/:projectId/data-quality/unresolved-receipts', authenticateToken, requirePermission('mrv:data-quality:read'), verifyMRVProjectAccess(['mrv-data-reviewer', 'mrv-project-manager', 'mrv-programme-admin']), async (req, res) => {
  try {
    const receipts = await TelemetryReceipt.find({ projectIds: req.params.projectId, status: { $in: ['UNRESOLVED', 'QUARANTINED', 'FAILED'] } }).sort({ receivedAt: -1 }).limit(200).lean();
    res.json({ success: true, data: receipts });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
