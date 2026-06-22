'use strict';
const router        = require('express').Router({ mergeParams: true });
const reportService = require('../../services/mrv/mrvReportService');
const pdfService    = require('../../services/mrv/mrvPdfService');
const MRVReport     = require('../../models/mrv/outbound/MRVReport.model');
const logger        = require('../../utils/logger');
const { requirePermission }      = require('../../middleware/authenticateApiKey');
const { verifyMRVProjectAccess } = require('../../middleware/mrv/verifyMRVProjectAccess');

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
router.get('/:projectId/monitoring-periods/:mpId/report', requirePermission('mrv:reports:read'), async (req, res) => {
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
router.post('/:projectId/monitoring-periods/:mpId/report/regenerate', requirePermission('mrv:reports:read'), async (req, res) => {
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

/**
 * @swagger
 * /api/mrv/projects/{projectId}/monitoring-periods/{mpId}/report/pdf:
 *   get:
 *     summary: Download the monitoring report as a branded PDF
 *     tags: [MRV Reports]
 *     description: >
 *       Streams a fully branded Crafted Climate PDF monitoring report.
 *       On first call the PDF is generated in-memory and streamed directly
 *       to the browser. Simultaneously it is uploaded to Azure Blob Storage
 *       in the background so subsequent requests redirect instantly.
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
 *       - in: query
 *         name: fresh
 *         schema:
 *           type: boolean
 *         description: Set to true to force re-generation even if a cached PDF exists
 *     responses:
 *       200:
 *         description: PDF file stream
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Monitoring period not found
 */
router.get('/:projectId/monitoring-periods/:mpId/report/pdf', requirePermission('mrv:reports:download'), async (req, res) => {
  try {
    const { mpId, projectId } = req.params;
    const forceFresh = req.query.fresh === 'true';

    // 1. Check for cached blob URL (instant redirect — no regeneration)
    if (!forceFresh) {
      const cached = await MRVReport.findOne(
        { monitoringPeriodId: mpId, status: 'FINAL', blobUrl: { $ne: null } },
        { blobUrl: 1 },
      ).lean();
      if (cached?.blobUrl) {
        logger.info(`[MRVPdf] Cache hit — redirecting to blob: ${cached.blobUrl}`);
        return res.redirect(302, cached.blobUrl);
      }
    }

    // 2. Get or generate the JSON report (fast — cached in DB)
    const reportDoc = await reportService.getOrGenerateReport(
      mpId,
      req.user?.userid || 'api',
    );

    // 3. Build PDF buffer (async, all in-memory)
    logger.info(`[MRVPdf] Generating PDF for period ${mpId}...`);
    const buffer = await pdfService.generatePdf(reportDoc);
    logger.info(`[MRVPdf] PDF generated — ${(buffer.length / 1024).toFixed(0)} KB`);

    // 4. Stream PDF to client immediately
    const filename = `mrv-report-${projectId}-${mpId}.pdf`;
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length':      buffer.length,
      'Cache-Control':       'private, max-age=300',
    });
    res.send(buffer);

    // 5. Upload to Azure Blob in background (non-blocking — response already sent)
    setImmediate(async () => {
      try {
        const blobName = `pdf/${projectId}/${mpId}/v${reportDoc.reportVersion || 1}.pdf`;
        const url = await pdfService.uploadPdfToBlob(buffer, blobName);
        if (url) {
          await MRVReport.updateOne(
            { reportId: reportDoc.reportId },
            { $set: { blobUrl: url } },
          );
          logger.info(`[MRVPdf] Uploaded to blob: ${url}`);
        }
      } catch (uploadErr) {
        logger.error(`[MRVPdf] Background blob upload failed: ${uploadErr.message}`);
      }
    });

  } catch (e) {
    if (res.headersSent) return; // already streaming, can't send error
    const code = e.message.includes('not found') ? 404 : 500;
    err(res, e, code);
  }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/monitoring-periods/{mpId}/report/pdf/queue:
 *   post:
 *     summary: Queue async PDF generation (fire-and-forget)
 *     tags: [MRV Reports]
 *     description: >
 *       Queues a background PDF generation job. Returns immediately with a
 *       job confirmation. The PDF URL will be available in the report's blobUrl
 *       field once the job completes. Use GET /report/pdf to check if it's ready.
 *     security:
 *       - bearerAuth: []
 */
router.post('/:projectId/monitoring-periods/:mpId/report/pdf/queue', requirePermission('mrv:reports:download'), async (req, res) => {
  try {
    const { mpId, projectId } = req.params;
    const requestedBy = req.user?.userid || 'api';

    // Non-blocking: kick off generation in background
    setImmediate(async () => {
      try {
        const reportDoc = await reportService.getOrGenerateReport(mpId, requestedBy);
        const buffer    = await pdfService.generatePdf(reportDoc);
        const blobName  = `pdf/${projectId}/${mpId}/v${reportDoc.reportVersion || 1}.pdf`;
        const url       = await pdfService.uploadPdfToBlob(buffer, blobName);
        if (url) {
          await MRVReport.updateOne({ reportId: reportDoc.reportId }, { $set: { blobUrl: url } });
          logger.info(`[MRVPdf] Queued PDF ready at: ${url}`);
        }
      } catch (bgErr) {
        logger.error(`[MRVPdf] Queued generation failed for ${mpId}: ${bgErr.message}`);
      }
    });

    ok(res, {
      message:  'PDF generation queued. Check GET /report/pdf when ready — it will redirect to the file.',
      mpId,
      projectId,
    });
  } catch (e) {
    err(res, e);
  }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/monitoring-periods/{mpId}/report/export-package:
 *   get:
 *     summary: Get the full submission export package
 *     tags: [MRV Reports]
 *     description: >
 *       Returns a structured manifest containing everything needed to submit a
 *       monitoring report to Verra, Gold Standard, or Ghana CMO: the JSON report
 *       with SHA-256 hash, PDF blob URL, evidence files with SHA-256 hashes,
 *       VVB verification opinion, calculation run summary, and a readiness checklist.
 *       Use this to review completeness before initiating submission.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: mpId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Full export package with submission checklist
 *       404:
 *         description: No report found for this monitoring period
 */
router.get(
  '/:projectId/monitoring-periods/:mpId/report/export-package',
  requirePermission('mrv:reports:read'),
  verifyMRVProjectAccess(['mrv-project-manager', 'mrv-programme-admin']),
  async (req, res) => {
    try {
      const pkg = await reportService.buildExportPackage(
        req.params.projectId,
        req.params.mpId
      );
      ok(res, { exportPackage: pkg });
    } catch (e) {
      const code = e.message.includes('not found') || e.message.includes('No report') ? 404 : 500;
      err(res, e, code);
    }
  }
);

/**
 * @swagger
 * /api/mrv/projects/{projectId}/monitoring-periods/{mpId}/report/submit:
 *   post:
 *     summary: "Step 1 of 2 — Initiate registry submission (Admin A)"
 *     tags: [MRV Reports]
 *     description: >
 *       Initiates a monitoring report submission to a carbon registry.
 *       Creates a PENDING_COUNTERSIGN request that must be confirmed by a
 *       *different* mrv-programme-admin within 48 hours via POST /submit/countersign.
 *
 *       This 2-person approval pattern is required by VCS Standard §4.1.4 and
 *       ISO 14064-3 (segregation of duties between preparer and authorising signatory).
 *
 *       For VERRA_VCS and GOLD_STANDARD a POSITIVE VVB verification opinion
 *       must be recorded before initiation is allowed.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [registry]
 *             properties:
 *               registry:
 *                 type: string
 *                 enum: [VERRA_VCS, GOLD_STANDARD, GHANA_CMO, CDM, OTHER]
 *               notes:
 *                 type: string
 *                 description: Optional notes forwarded to the registry event log
 *     responses:
 *       200:
 *         description: Submission request created — awaiting countersign
 *       400:
 *         description: Validation failure (not FINAL / VVB opinion missing / request already pending)
 *       403:
 *         description: Requires mrv-programme-admin role
 */
router.post(
  '/:projectId/monitoring-periods/:mpId/report/submit',
  requirePermission('mrv:reports:write'),
  verifyMRVProjectAccess(['mrv-programme-admin']),
  async (req, res) => {
    try {
      const { registry, notes } = req.body;
      if (!registry) {
        return err(res, new Error('registry is required: VERRA_VCS | GOLD_STANDARD | GHANA_CMO | CDM | OTHER'), 400);
      }
      const result = await reportService.initiateSubmission(
        req.params.projectId,
        req.params.mpId,
        { registry, notes, requestedBy: req.user.userid }
      );
      ok(res, result);
    } catch (e) {
      const isClient = /must be FINAL|already been submitted|already pending|POSITIVE VVB/i.test(e.message);
      err(res, e, e.message.includes('not found') ? 404 : isClient ? 400 : 500);
    }
  }
);

/**
 * @swagger
 * /api/mrv/projects/{projectId}/monitoring-periods/{mpId}/report/submit/countersign:
 *   post:
 *     summary: "Step 2 of 2 — Countersign and complete registry submission (Admin B)"
 *     tags: [MRV Reports]
 *     description: >
 *       Completes the 2-step submission flow. The countersigning admin MUST be
 *       a different person from the one who called POST /submit (enforced server-side).
 *
 *       On success:
 *       - MRVReport status → SUBMITTED
 *       - MRVProject status → VERRA_REVIEW (Verra/GS) or ghanaPathway.cmoEngagementStatus → SUBMITTED (Ghana CMO)
 *       - A MONITORING_REPORT_SUBMITTED RegistryEvent is auto-created
 *       - A mrv.report.submitted webhook fires to all subscribed endpoints
 *       - Full export package is returned for archival
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Report submitted — full export package included in response
 *       400:
 *         description: No pending request / expired 48h window / same-person violation
 *       403:
 *         description: Requires mrv-programme-admin role
 */
router.post(
  '/:projectId/monitoring-periods/:mpId/report/submit/countersign',
  requirePermission('mrv:reports:write'),
  verifyMRVProjectAccess(['mrv-programme-admin']),
  async (req, res) => {
    try {
      const result = await reportService.countersignSubmission(
        req.params.projectId,
        req.params.mpId,
        { countersignedBy: req.user.userid }
      );
      ok(res, result);
    } catch (e) {
      const isClient = /must be a different|expired|No pending|already been submitted/i.test(e.message);
      err(res, e, e.message.includes('not found') ? 404 : isClient ? 400 : 500);
    }
  }
);

module.exports = router;
