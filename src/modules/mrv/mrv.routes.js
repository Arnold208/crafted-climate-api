'use strict';

/**
 * MRV Engine — Top-level router
 *
 * All routes in this file are mounted at /api/mrv
 * All endpoints are tagged 'MRV Engine' in Swagger docs.
 *
 * Route structure:
 *   GET  /api/mrv/catalogue/standards
 *   GET  /api/mrv/catalogue/methodologies
 *   GET  /api/mrv/catalogue/implementations
 *   GET  /api/mrv/catalogue/sensor-capabilities
 *   GET  /api/mrv/catalogue/factors
 *
 *   GET  /api/mrv/projects
 *   POST /api/mrv/projects
 *   GET  /api/mrv/projects/:projectId
 *   GET  /api/mrv/projects/:projectId/sites
 *   GET  /api/mrv/projects/:projectId/partners
 *   GET  /api/mrv/projects/:projectId/methodology-assignments
 *   GET  /api/mrv/projects/:projectId/members
 *   GET  /api/mrv/projects/:projectId/readiness
 *
 *   GET  /api/mrv/projects/:projectId/monitoring-periods
 *   POST /api/mrv/projects/:projectId/monitoring-periods
 *   POST /api/mrv/projects/:projectId/monitoring-periods/:id/open
 *   POST /api/mrv/projects/:projectId/monitoring-periods/:id/close
 *   GET  /api/mrv/projects/:projectId/monitoring-periods/:id/observations
 *
 *   GET  /api/mrv/projects/:projectId/evidence
 *   POST /api/mrv/projects/:projectId/evidence/upload
 *   POST /api/mrv/projects/:projectId/evidence/upload-token
 *   GET  /api/mrv/projects/:projectId/manual-observations
 *   POST /api/mrv/projects/:projectId/manual-observations
 *   POST /api/mrv/projects/:projectId/manual-observations/:id/approve
 *   GET  /api/mrv/projects/:projectId/csv-imports
 *   POST /api/mrv/projects/:projectId/csv-imports
 *   GET  /api/mrv/projects/:projectId/installations
 *   POST /api/mrv/projects/:projectId/installations                              ← link existing device to project
 *   GET  /api/mrv/projects/:projectId/installations/:installationId
 *   PATCH /api/mrv/projects/:projectId/installations/:installationId/maintenance         ← put device in maintenance
 *   PATCH /api/mrv/projects/:projectId/installations/:installationId/maintenance/return  ← bring device back to ACTIVE
 *   POST /api/mrv/projects/:projectId/installations/:installationId/replace      ← permanent device swap (audit trail preserved)
 *   GET  /api/mrv/projects/:projectId/calibrations
 *   POST /api/mrv/projects/:projectId/calibrations
 *   GET  /api/mrv/projects/:projectId/receipts
 *
 *   GET  /api/mrv/projects/:projectId/data-quality/quarantined
 *   POST /api/mrv/projects/:projectId/data-quality/observations/:id/approve
 *   POST /api/mrv/projects/:projectId/data-quality/observations/:id/void
 *   GET  /api/mrv/projects/:projectId/data-quality/summary
 *   GET  /api/mrv/projects/:projectId/data-quality/unresolved-receipts
 *
 *   GET  /api/mrv/projects/:projectId/verification-cases
 *   POST /api/mrv/projects/:projectId/verification-cases
 *   GET  /api/mrv/projects/:projectId/verification-cases/:caseId/findings
 *   POST /api/mrv/projects/:projectId/verification-cases/:caseId/findings
 *   POST /api/mrv/projects/:projectId/verification-cases/:caseId/opinion
 *   GET  /api/mrv/projects/:projectId/registry-events
 *   POST /api/mrv/projects/:projectId/registry-events
 *   GET  /api/mrv/projects/:projectId/audit-log
 *
 *   GET  /api/mrv/projects/:projectId/monitoring-periods/:mpId/report
 *   POST /api/mrv/projects/:projectId/monitoring-periods/:mpId/report/regenerate
 *
 *   GET  /api/mrv/projects/:projectId/analytics/summary
 *   GET  /api/mrv/projects/:projectId/analytics/timeseries
 *   GET  /api/mrv/projects/:projectId/analytics/device-performance
 *   GET  /api/mrv/analytics/portfolio
 *   GET  /api/mrv/ops/queues
 *   GET  /api/mrv/ops/queues/:queueName
 *   POST /api/mrv/ops/queues/:queueName/retry-failed
 *
 *   POST /api/mrv/projects/:projectId/monitoring-periods/:mpId/calculate
 *   GET  /api/mrv/projects/:projectId/monitoring-periods/:mpId/calculation
 *   GET  /api/mrv/projects/:projectId/monitoring-periods/:mpId/calculations
 *   POST /api/mrv/projects/:projectId/calculation-runs/:runId/approve
 *
 *   POST /api/mrv/projects/:projectId/webhooks              ← register outbound webhook endpoint
 *   GET  /api/mrv/projects/:projectId/webhooks              ← list endpoints
 *   PATCH /api/mrv/projects/:projectId/webhooks/:endpointId ← update/pause/resume
 *   DELETE /api/mrv/projects/:projectId/webhooks/:endpointId ← disable
 *   GET  /api/mrv/projects/:projectId/webhooks/:endpointId/deliveries ← delivery log
 *   POST /api/mrv/projects/:projectId/webhooks/:endpointId/test  ← test ping
 *
 *   POST /api/mrv/projects/:projectId/vvb-access            ← issue VVB key
 *   GET  /api/mrv/projects/:projectId/vvb-access            ← list grants
 *   POST /api/mrv/projects/:projectId/vvb-access/:id/revoke ← revoke grant
 *
 *   GET  /api/vvb/:projectId/package          ← VVB: full data package        (vvbRouter, mounted in app.js)
 *   GET  /api/vvb/:projectId/observations     ← VVB: paginated observations   (vvbRouter, mounted in app.js)
 *   GET  /api/vvb/:projectId/evidence-files   ← VVB: evidence list            (vvbRouter, mounted in app.js)
 *   GET  /api/vvb/:projectId/audit-log        ← VVB: audit trail              (vvbRouter, mounted in app.js)
 *   GET  /api/vvb/:projectId/calibrations     ← VVB: calibration records      (vvbRouter, mounted in app.js)
 *   GET  /api/vvb/:projectId/installations    ← VVB: installation records     (vvbRouter, mounted in app.js)
 *
 *   POST /api/ingest/telemetry        (mounted separately in app.js)
 *   POST /api/ingest/telemetry/batch  (mounted separately in app.js)
 */

const router = require('express').Router();
const authenticateToken          = require('../../middleware/bearermiddleware');
const requireMRVSubscription     = require('../../middleware/mrv/requireMRVSubscription');

const catalogueRoutes          = require('./catalogue.routes');
const projectRoutes            = require('./project.routes');
const monitoringRoutes         = require('./monitoring.routes');
const evidenceRoutes           = require('./evidence.routes');
const dataQualityRoutes        = require('./dataQuality.routes');
const assuranceRoutes          = require('./assurance.routes');
const webhookRoutes            = require('./webhook.routes');
const { ownerRouter, vvbRouter } = require('./vvb.routes');
const analyticsRoutes          = require('./analytics.routes');
const portfolioAnalyticsRoutes = require('./portfolioAnalytics.routes');
const overviewRoutes           = require('./overview.routes');
const reportRoutes             = require('./report.routes');
const calculationRoutes        = require('./calculation.routes');
const operationalSetupRoutes   = require('./operationalSetup.routes');
const queueOpsRoutes           = require('./queueOps.routes');

// ── Global MRV gate: authenticate THEN check enterprise/maas_enterprise plan ──
// Every sub-router below is protected by both guards.
router.use(authenticateToken);
router.use(requireMRVSubscription);

router.use('/', overviewRoutes);
router.use('/catalogue', catalogueRoutes);
router.use('/projects', projectRoutes);
router.use('/projects', operationalSetupRoutes);
router.use('/projects', monitoringRoutes);
router.use('/projects', evidenceRoutes);
router.use('/projects', dataQualityRoutes);
router.use('/projects', assuranceRoutes);
router.use('/projects', webhookRoutes);
router.use('/projects', ownerRouter);
router.use('/projects', analyticsRoutes);
router.use('/projects', reportRoutes);
router.use('/analytics', portfolioAnalyticsRoutes);
router.use('/projects', calculationRoutes);
router.use('/ops', queueOpsRoutes);

/**
 * @swagger
 * /api/mrv/health:
 *   get:
 *     summary: MRV Engine health check
 *     tags: [MRV Engine]
 *     responses:
 *       200:
 *         description: MRV Engine is operational
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    engine: 'MRV Engine v1.0.0',
    status: 'operational',
    vm0050CalculationStatus: 'BLOCKED — mayCalculate=false (pending sign-off)',
    analyticsStatus: 'operational',
    reportStatus: 'operational',
    timestamp: new Date().toISOString()
  });
});

module.exports = { mrvRouter: router, vvbRouter };

