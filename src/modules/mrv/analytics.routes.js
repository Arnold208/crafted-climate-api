'use strict';
const router = require('express').Router({ mergeParams: true });
const analyticsService = require('../../services/mrv/mrvAnalyticsService');
const { createAuditLog } = require('../../utils/auditLogger');

// ── Helper ────────────────────────────────────────────────────────────────────
const ok  = (res, data) => res.json({ success: true, ...data });
const err = (res, e, code = 500) => res.status(code).json({ success: false, error: e.message });

/**
 * @swagger
 * /api/mrv/projects/{projectId}/analytics/summary:
 *   get:
 *     summary: Project monitoring summary (cached 5 min)
 *     tags: [MRV Analytics]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Project summary statistics
 */
router.get('/:projectId/analytics/summary', async (req, res) => {
  try {
    const data = await analyticsService.getProjectSummary(req.params.projectId);
    ok(res, { summary: data });
  } catch (e) { err(res, e); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/analytics/timeseries:
 *   get:
 *     summary: Time-series sensor readings aggregation
 *     tags: [MRV Analytics]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: granularity
 *         schema: { type: string, enum: [daily, weekly, monthly], default: daily }
 *       - in: query
 *         name: metric
 *         schema: { type: string, default: lpg_consumed_kg }
 *       - in: query
 *         name: auid
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Time-series data
 */
router.get('/:projectId/analytics/timeseries', async (req, res) => {
  try {
    const { from, to, granularity, metric, auid } = req.query;
    const data = await analyticsService.getTimeSeries({
      projectId: req.params.projectId,
      from, to, granularity, metric, auid
    });
    ok(res, data);
  } catch (e) { err(res, e); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/analytics/device-performance:
 *   get:
 *     summary: Per-device data quality and uptime performance
 *     tags: [MRV Analytics]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: mpId
 *         schema: { type: string }
 *         description: Optional - filter to a specific monitoring period
 *     responses:
 *       200:
 *         description: Device performance breakdown
 */
router.get('/:projectId/analytics/device-performance', async (req, res) => {
  try {
    const data = await analyticsService.getDevicePerformance({
      projectId: req.params.projectId,
      monitoringPeriodId: req.query.mpId
    });
    ok(res, data);
  } catch (e) { err(res, e); }
});

module.exports = router;
