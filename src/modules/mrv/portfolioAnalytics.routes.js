'use strict';
const router = require('express').Router();
const analyticsService = require('../../services/mrv/mrvAnalyticsService');

const ok  = (res, data) => res.json({ success: true, ...data });
const err = (res, e, code = 500) => res.status(code).json({ success: false, error: e.message });

/**
 * @swagger
 * /api/mrv/analytics/portfolio:
 *   get:
 *     summary: Organisation-wide MRV portfolio overview
 *     tags: [MRV Analytics]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Portfolio summary
 */
router.get('/portfolio', async (req, res) => {
  try {
    const orgId = req.user?.organizationId
      || req.user?.currentOrganizationId
      || req.headers['x-org-id'];
    if (!orgId) return res.status(400).json({ success: false, error: 'organizationId not found — pass x-org-id header' });
    const data = await analyticsService.getPortfolioOverview(orgId);
    ok(res, { portfolio: data });
  } catch (e) { err(res, e); }
});

module.exports = router;
