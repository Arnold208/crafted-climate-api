'use strict';
const router = require('express').Router();
const analyticsService = require('../../services/mrv/mrvAnalyticsService');
const { requirePermission } = require('../../middleware/authenticateApiKey');

const ok = (res, data) => res.json({ success: true, ...data });
const err = (res, e, code = 500) => res.status(code).json({ success: false, error: e.message });

/**
 * @swagger
 * /api/mrv/overview:
 *   get:
 *     summary: MRV operations overview for the current workspace
 *     description: >
 *       Returns the main MRV portal overview for project developers, including
 *       project portfolio counts, active devices, observation quality, evidence
 *       status, monitoring periods, calculation posture, and project next actions.
 *       The endpoint is internally scoped by organization/workspace context from
 *       the authenticated user or x-org-id header; users should not be asked to
 *       manually enter organization IDs in the portal.
 *     tags: [MRV Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-org-id
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional workspace context when the user belongs to more than one organization.
 *     responses:
 *       200:
 *         description: MRV operations overview
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 overview:
 *                   type: object
 *                   properties:
 *                     organizationId: { type: string, example: org-starter-uuid }
 *                     generatedAt: { type: string, format: date-time }
 *                     warning: { type: string, example: This result has not yet been independently verified or approved by Verra. }
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalProjects: { type: number, example: 12 }
 *                         activeProjects: { type: number, example: 7 }
 *                         inactiveProjects: { type: number, example: 5 }
 *                         totalSites: { type: number, example: 42 }
 *                         activeDevices: { type: number, example: 128 }
 *                         maintenanceDevices: { type: number, example: 3 }
 *                         totalDevices: { type: number, example: 136 }
 *                         totalObservations: { type: number, example: 52318 }
 *                         acceptedObservations: { type: number, example: 50110 }
 *                         acceptedObservationRate: { type: number, example: 95.8 }
 *                         pendingReviewObservations: { type: number, example: 310 }
 *                         quarantinedObservations: { type: number, example: 42 }
 *                         evidenceRecords: { type: number, example: 884 }
 *                         pendingEvidence: { type: number, example: 19 }
 *                         openMonitoringPeriods: { type: number, example: 4 }
 *                         calculationRuns: { type: number, example: 16 }
 *                         approvedCalculations: { type: number, example: 3 }
 *                         verraApprovedCalculations: { type: number, example: 0 }
 *                     charts:
 *                       type: object
 *                       properties:
 *                         projectStatus: { type: array, items: { type: object } }
 *                         deviceStatus: { type: array, items: { type: object } }
 *                         observationQuality: { type: array, items: { type: object } }
 *                         monitoringPeriodStatus: { type: array, items: { type: object } }
 *                         evidenceStatus: { type: array, items: { type: object } }
 *                         calculationStatus: { type: array, items: { type: object } }
 *                     dataQuality: { type: object }
 *                     projects:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           projectId: { type: string, example: CC-COOK-001 }
 *                           name: { type: string, example: Foovante Clean Cooking Pilot }
 *                           status: { type: string, example: MONITORING }
 *                           activityType: { type: string, example: CLEAN_COOKING }
 *                           activeDevices: { type: number, example: 24 }
 *                           totalObservations: { type: number, example: 8120 }
 *                           acceptedObservationRate: { type: number, example: 96.1 }
 *                           openMonitoringPeriods: { type: number, example: 1 }
 *                           pendingEvidence: { type: number, example: 4 }
 *                           nextAction: { type: string, example: Review data quality items }
 *       400:
 *         description: Workspace context missing
 *       403:
 *         description: MRV subscription or permission required
 */
router.get('/overview', requirePermission('mrv:analytics:read'), async (req, res) => {
  try {
    const orgId = req.user?.organizationId
      || req.user?.currentOrganizationId
      || req.headers['x-org-id'];
    if (!orgId) return res.status(400).json({ success: false, error: 'organizationId not found - pass x-org-id header' });
    const data = await analyticsService.getOperationsOverview(orgId);
    ok(res, { overview: data });
  } catch (e) { err(res, e); }
});

module.exports = router;
