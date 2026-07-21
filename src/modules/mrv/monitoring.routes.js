'use strict';
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const authenticateToken = require('../../middleware/bearermiddleware');
const { requirePermission } = require('../../middleware/authenticateApiKey');
const { verifyMRVProjectAccess } = require('../../middleware/mrv/verifyMRVProjectAccess');
const { mrvAuditEvent } = require('../../middleware/mrv/mrvAuditEvent');
const MonitoringPeriod = require('../../models/mrv/monitoring/MonitoringPeriod.model');
const MRVObservation = require('../../models/mrv/evidence/MRVObservation.model');
const MRVProject = require('../../models/mrv/project/MRVProject.model');
const { mrvCompletenessQueue } = require('../../workers/mrv/queues');

/**
 * @swagger
 * /api/mrv/projects/{projectId}/monitoring-periods:
 *   get:
 *     summary: List all monitoring periods for a project
 *     tags: [MRV Engine - Monitoring]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of monitoring periods sorted by startDate descending
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/MonitoringPeriod' }
 *       403: { description: Not a project member }
 *       404: { description: Project not found }
 */
router.get('/:projectId/monitoring-periods', authenticateToken, requirePermission('mrv:monitoring:read'), verifyMRVProjectAccess(), async (req, res) => {
  try {
    const periods = await MonitoringPeriod.find({ projectId: req.params.projectId }).lean();
    periods.sort((a, b) => new Date(b.createdAt || b.startDate || 0) - new Date(a.createdAt || a.startDate || 0));
    res.json({ success: true, data: periods });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/monitoring-periods:
 *   post:
 *     summary: Create a new monitoring period (starts in DRAFT status)
 *     description: |
 *       Creates a monitoring period in `DRAFT` status. It must be explicitly **opened** before
 *       sensor observations are linked to it. Workflow: `DRAFT → OPEN → CLOSED → CALCULATION_IN_PROGRESS → ...`
 *     tags: [MRV Engine - Monitoring]
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
 *           schema: { $ref: '#/components/schemas/CreateMonitoringPeriodRequest' }
 *           examples:
 *             q1_2026:
 *               summary: Q1 2026 monitoring period
 *               value:
 *                 name: "Monitoring Period 1 — Q1 2026"
 *                 startDate: "2026-01-01"
 *                 endDate: "2026-03-31"
 *                 assignmentId: "ASGN-abc123"
 *     responses:
 *       201:
 *         description: Monitoring period created in DRAFT status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/MonitoringPeriod' }
 *       400: { description: startDate and endDate are required }
 *       403: { description: Requires mrv-project-manager or mrv-programme-admin }
 */
router.post('/:projectId/monitoring-periods', authenticateToken, requirePermission('mrv:monitoring:write'), verifyMRVProjectAccess(['mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'MONITORING_PERIOD_CREATED', entityType: 'MonitoringPeriod', getEntityId: (req, body) => body?.data?.monitoringPeriodId }),
  async (req, res) => {
  try {
    const { startDate, endDate, name, assignmentId } = req.body;
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate are required' });
    const monitoringPeriodId = `MP-${Date.now().toString(36).toUpperCase()}-${uuidv4().slice(0, 6)}`;
    const period = await MonitoringPeriod.create({
      monitoringPeriodId, projectId: req.params.projectId,
      organizationId: req.mrvProject.organizationId,
      name: name || `Period ${monitoringPeriodId}`,
      startDate: new Date(startDate), endDate: new Date(endDate),
      assignmentId, status: 'DRAFT', createdBy: req.user?.userid
    });
    res.status(201).json({ success: true, data: period });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/monitoring-periods/{monitoringPeriodId}/open:
 *   post:
 *     summary: Open a monitoring period (DRAFT → OPEN)
 *     description: Transitions the period from DRAFT to OPEN. Once open, sensor observations are linked to it and data quality tracking begins.
 *     tags: [MRV Engine - Monitoring]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: monitoringPeriodId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Period opened successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/MonitoringPeriod' }
 *       409:
 *         description: Cannot open — period is not in DRAFT status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error: { type: string, example: "Cannot open period in status: OPEN" }
 */
router.post('/:projectId/monitoring-periods/:monitoringPeriodId/open', authenticateToken, requirePermission('mrv:monitoring:write'), verifyMRVProjectAccess(['mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'MONITORING_PERIOD_OPENED', entityType: 'MonitoringPeriod', getEntityId: (req) => req.params.monitoringPeriodId }),
  async (req, res) => {
  try {
    const period = await MonitoringPeriod.findOne({ monitoringPeriodId: req.params.monitoringPeriodId, projectId: req.params.projectId });
    if (!period) return res.status(404).json({ error: 'Monitoring period not found' });
    if (period.status !== 'DRAFT') return res.status(409).json({ error: `Cannot open period in status: ${period.status}` });
    const project = await MRVProject.findOne({ projectId: req.params.projectId }).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.readinessStatus !== 'READY') return res.status(409).json({ error: 'Run readiness and resolve all blocking items before opening monitoring.' });
    const existingOpenPeriod = await MonitoringPeriod.findOne({ projectId: req.params.projectId, monitoringPeriodId: { $ne: req.params.monitoringPeriodId }, status: 'OPEN' }).lean();
    if (existingOpenPeriod) return res.status(409).json({ error: `Monitoring period ${existingOpenPeriod.monitoringPeriodId} is already open. Close it before opening another period.` });
    period.status = 'OPEN'; period.openedAt = new Date(); period.openedBy = req.user?.userid;
    await period.save();
    await MRVProject.findOneAndUpdate(
      { projectId: req.params.projectId, status: { $in: ['READY_FOR_MONITORING', 'CANDIDATE', 'APPLICABILITY_REVIEW', 'LEGAL_REVIEW', 'SANDBOX'] } },
      { $set: { status: 'MONITORING', monitoringPeriodStart: period.startDate, updatedAt: new Date() } },
    );
    res.json({ success: true, data: period });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/monitoring-periods/{monitoringPeriodId}/close:
 *   post:
 *     summary: Close a monitoring period (OPEN → CLOSED) and trigger completeness calculation
 *     description: |
 *       Closes an OPEN monitoring period and enqueues a `mrv-completeness` job to calculate
 *       observation completeness ratios. After closing, no new sensor observations are linked.
 *     tags: [MRV Engine - Monitoring]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: monitoringPeriodId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Period closed and completeness calculation enqueued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/MonitoringPeriod' }
 *       409:
 *         description: Cannot close — period is not OPEN
 */
router.post('/:projectId/monitoring-periods/:monitoringPeriodId/close', authenticateToken, requirePermission('mrv:monitoring:write'), verifyMRVProjectAccess(['mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'MONITORING_PERIOD_CLOSED', entityType: 'MonitoringPeriod', getEntityId: (req) => req.params.monitoringPeriodId }),
  async (req, res) => {
  try {
    const period = await MonitoringPeriod.findOne({ monitoringPeriodId: req.params.monitoringPeriodId, projectId: req.params.projectId });
    if (!period) return res.status(404).json({ error: 'Monitoring period not found' });
    if (period.status !== 'OPEN') return res.status(409).json({ error: `Cannot close period in status: ${period.status}` });
    period.status = 'CLOSED'; period.closedAt = new Date(); period.closedBy = req.user?.userid;
    await period.save();
    await mrvCompletenessQueue.add('completeness', { projectId: req.params.projectId, monitoringPeriodId: req.params.monitoringPeriodId });
    res.json({ success: true, data: period });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/monitoring-periods/{monitoringPeriodId}/observations:
 *   get:
 *     summary: List sensor observations within a monitoring period
 *     description: Paginated list of MRV observations for a specific monitoring period. Filter by quality status to review quarantined or accepted data.
 *     tags: [MRV Engine - Monitoring]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: monitoringPeriodId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: qualityStatus
 *         schema:
 *           type: string
 *           enum: [PENDING, ACCEPTED, ACCEPTED_WITH_WARNING, QUARANTINED, REJECTED, MANUALLY_APPROVED, VOIDED]
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100, maximum: 500 }
 *     responses:
 *       200:
 *         description: Paginated list of observations
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MRVListResponse' }
 */
router.get('/:projectId/monitoring-periods/:monitoringPeriodId/observations', authenticateToken, requirePermission('mrv:evidence:read'), verifyMRVProjectAccess(), async (req, res) => {
  try {
    const { page = 1, limit = 100, qualityStatus } = req.query;
    const filter = { projectId: req.params.projectId, monitoringPeriodId: req.params.monitoringPeriodId };
    if (qualityStatus) filter.qualityStatus = qualityStatus;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [observations, total] = await Promise.all([
      MRVObservation.find(filter).lean(),
      MRVObservation.countDocuments(filter)
    ]);
    observations.sort((a, b) => new Date(b.observedAt || 0) - new Date(a.observedAt || 0));
    const paged = observations.slice(skip, skip + parseInt(limit));
    res.json({ success: true, data: paged, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
