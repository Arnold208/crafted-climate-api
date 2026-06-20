'use strict';
const router        = require('express').Router({ mergeParams: true });
const reportService = require('../../services/mrv/mrvReportService');

const ok  = (res, data)          => res.json({ success: true, ...data });
const err = (res, e, code = 500) => res.status(code).json({ success: false, error: e.message });

/**
 * @swagger
 * /api/mrv/projects/{projectId}/monitoring-periods/{mpId}/report:
 *   get:
 *     summary: Get the structured JSON monitoring report for a period
 *     tags: [MRV Reports]
 *     description: >
 *       Returns (or generates) the full structured monitoring report for the
 *       given monitoring period as a JSON document. The report is cached in
 *       the database — call POST /regenerate to force a fresh build.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: MRV project ID
 *       - in: path
 *         name: mpId
 *         required: true
 *         schema:
 *           type: string
 *         description: Monitoring period ID
 *     responses:
 *       200:
 *         description: Full monitoring report (header, devices, observations, calculations, attachments)
 *       404:
 *         description: Monitoring period not found
 *       500:
 *         description: Internal server error
 */
router.get('/:projectId/monitoring-periods/:mpId/report', async (req, res) => {
  try {
    const report = await reportService.getOrGenerateReport(
      req.params.mpId,
      req.user?.userid || 'api'
    );
    ok(res, {
      report: {
        reportId:      report.reportId,
        reportVersion: report.reportVersion,
        status:        report.status,
        sha256:        report.sha256,
        generatedAt:   report.generatedAt,
        sections:      report.sections,
      },
    });
  } catch (e) {
    const code = e.message.includes('not found') ? 404 : 500;
    err(res, e, code);
  }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/monitoring-periods/{mpId}/report/regenerate:
 *   post:
 *     summary: Force-regenerate the monitoring report (picks up new calculation results)
 *     tags: [MRV Reports]
 *     description: >
 *       Rebuilds the report data from scratch without persisting. Useful for
 *       previewing an updated report after new observations or calculations.
 *       Call GET /report to persist a new versioned copy.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: mpId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Freshly-built (non-persisted) report data
 *       404:
 *         description: Monitoring period not found
 *       500:
 *         description: Internal server error
 */
router.post('/:projectId/monitoring-periods/:mpId/report/regenerate', async (req, res) => {
  try {
    const data = await reportService.buildReportData(
      req.params.mpId,
      req.user?.userid || 'api'
    );
    ok(res, {
      message:    'Report data regenerated (preview only — call GET /report to persist a new version)',
      reportData: data,
    });
  } catch (e) {
    const code = e.message.includes('not found') ? 404 : 500;
    err(res, e, code);
  }
});

module.exports = router;
