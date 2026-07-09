'use strict';

/**
 * MRV Engine â€” Top-level router
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
 *   POST /api/mrv/projects/:projectId/installations                              â† link existing device to project
 *   GET  /api/mrv/projects/:projectId/installations/:installationId
 *   PATCH /api/mrv/projects/:projectId/installations/:installationId/maintenance         â† put device in maintenance
 *   PATCH /api/mrv/projects/:projectId/installations/:installationId/maintenance/return  â† bring device back to ACTIVE
 *   POST /api/mrv/projects/:projectId/installations/:installationId/replace      â† permanent device swap (audit trail preserved)
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
 *
 *   POST /api/mrv/projects/:projectId/monitoring-periods/:mpId/calculate
 *   GET  /api/mrv/projects/:projectId/monitoring-periods/:mpId/calculation
 *   GET  /api/mrv/projects/:projectId/monitoring-periods/:mpId/calculations
 *   POST /api/mrv/projects/:projectId/calculation-runs/:runId/approve
 *
 *   POST /api/mrv/projects/:projectId/webhooks              â† register outbound webhook endpoint
 *   GET  /api/mrv/projects/:projectId/webhooks              â† list endpoints
 *   PATCH /api/mrv/projects/:projectId/webhooks/:endpointId â† update/pause/resume
 *   DELETE /api/mrv/projects/:projectId/webhooks/:endpointId â† disable
 *   GET  /api/mrv/projects/:projectId/webhooks/:endpointId/deliveries â† delivery log
 *   POST /api/mrv/projects/:projectId/webhooks/:endpointId/test  â† test ping
 *
 *   POST /api/mrv/projects/:projectId/vvb-access            â† issue VVB key
 *   GET  /api/mrv/projects/:projectId/vvb-access            â† list grants
 *   POST /api/mrv/projects/:projectId/vvb-access/:id/revoke â† revoke grant
 *
 *   GET  /api/vvb/:projectId/package          â† VVB: full data package        (vvbRouter, mounted in app.js)
 *   GET  /api/vvb/:projectId/observations     â† VVB: paginated observations   (vvbRouter, mounted in app.js)
 *   GET  /api/vvb/:projectId/evidence-files   â† VVB: evidence list            (vvbRouter, mounted in app.js)
 *   GET  /api/vvb/:projectId/audit-log        â† VVB: audit trail              (vvbRouter, mounted in app.js)
 *   GET  /api/vvb/:projectId/calibrations     â† VVB: calibration records      (vvbRouter, mounted in app.js)
 *   GET  /api/vvb/:projectId/installations    â† VVB: installation records     (vvbRouter, mounted in app.js)
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

// â”€â”€ Global MRV gate: authenticate THEN check enterprise/maas_enterprise plan â”€â”€
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
    vm0050CalculationStatus: 'BLOCKED â€” mayCalculate=false (pending sign-off)',
    analyticsStatus: 'operational',
    reportStatus: 'operational',
    timestamp: new Date().toISOString()
  });
});

module.exports = { mrvRouter: router, vvbRouter };

