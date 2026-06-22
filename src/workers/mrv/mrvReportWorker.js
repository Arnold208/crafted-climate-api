'use strict';
const { Worker } = require('bullmq');
const logger     = require('../../utils/logger');

function startMRVReportWorker() {
  const connection = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  };

  const worker = new Worker('mrv-report', async (job) => {
    const { type, monitoringPeriodId, projectId, requestedBy = 'system' } = job.data;

    // ── generate-report: build JSON report + PDF and upload ───────────────────
    if (type === 'generate-report' || type === 'generate-pdf' || !type) {
      logger.info(`[MRVReport] Job ${job.id} — generating report for period ${monitoringPeriodId}`);

      // Lazy load to avoid circular deps at startup
      const reportService = require('../../services/mrv/mrvReportService');
      const pdfService    = require('../../services/mrv/mrvPdfService');
      const MRVReport     = require('../../models/mrv/outbound/MRVReport.model');

      // Step 1: Generate (or retrieve) JSON report
      const reportDoc = await reportService.getOrGenerateReport(monitoringPeriodId, requestedBy);
      logger.info(`[MRVReport] JSON report ready: ${reportDoc.reportId} v${reportDoc.reportVersion}`);

      // Step 2: Generate PDF buffer
      const buffer = await pdfService.generatePdf(reportDoc);
      logger.info(`[MRVReport] PDF generated — ${(buffer.length / 1024).toFixed(0)} KB`);

      // Step 3: Upload to Azure Blob
      const blobName = `pdf/${projectId || 'unknown'}/${monitoringPeriodId}/v${reportDoc.reportVersion || 1}.pdf`;
      const blobUrl  = await pdfService.uploadPdfToBlob(buffer, blobName);

      if (blobUrl) {
        await MRVReport.updateOne({ reportId: reportDoc.reportId }, { $set: { blobUrl } });
        logger.info(`[MRVReport] PDF uploaded: ${blobUrl}`);
      } else {
        logger.warn(`[MRVReport] PDF generated but blob upload skipped (no Azure config)`);
      }

      return {
        reportId:      reportDoc.reportId,
        reportVersion: reportDoc.reportVersion,
        blobUrl,
        pdfKb: Math.round(buffer.length / 1024),
      };
    }

    logger.warn(`[MRVReport] Unknown job type: ${type} — skipping`);
    return { skipped: true };

  }, { connection, concurrency: 2 });

  worker.on('completed', (job, result) => {
    logger.info(`[MRVReport] Job ${job.id} complete — reportId: ${result?.reportId}, PDF: ${result?.pdfKb}KB`);
  });
  worker.on('failed', (job, err) => {
    logger.error(`[MRVReport] Job ${job?.id} failed: ${err.message}`);
  });
  worker.on('error', err => {
    logger.error('[MRVReport] Worker error:', err);
  });

  console.log('✅ MRV Report Worker started (PDF generation enabled)');
  return worker;
}

module.exports = { startMRVReportWorker };
