'use strict';
/**
 * requireMRVSubscription
 * ══════════════════════
 * Gate middleware for ALL MRV Engine routes.
 * Only organizations on enterprise or maas_enterprise plans can access MRV.
 *
 * Usage:  router.use(requireMRVSubscription)
 *
 * On failure → HTTP 403 with upgrade guidance.
 * On success → sets req.planFeatures and calls next().
 */

const { PLAN_FEATURES } = require('../../config/planFeatures');
const getUserPlan       = require('../subscriptions/getUserPlan');

const requireMRVSubscription = async (req, res, next) => {
  try {
    // Must be authenticated first (bearermiddleware sets req.user)
    if (!req.user || !req.user.userid) {
      return res.status(401).json({
        success: false,
        error:   'Authentication required',
        code:    'UNAUTHENTICATED'
      });
    }

    const userid = req.user.userid;
    const orgId  = req.headers['x-org-id'] || req.user.currentOrganizationId;

    // Resolve the effective plan (org-level or personal)
    const { plan } = await getUserPlan(userid, orgId);

    if (!plan) {
      return res.status(403).json({
        success:    false,
        error:      'No active subscription found. MRV Engine requires an Enterprise or MaaS Enterprise plan.',
        code:       'NO_SUBSCRIPTION',
        upgradeUrl: '/pricing'
      });
    }

    // Look up features from config (always fresh, no DB migration needed)
    const effectiveFeatures = PLAN_FEATURES[plan.name?.toLowerCase()] || plan.features || {};
    const hasMRV = !!effectiveFeatures.mrvEngine;

    if (!hasMRV) {
      return res.status(403).json({
        success:     false,
        error:       `MRV Engine is not available on the "${plan.name}" plan. Upgrade to Enterprise or MaaS Enterprise to access Measurement, Reporting & Verification features.`,
        code:        'MRV_PLAN_REQUIRED',
        currentPlan: plan.name,
        requiredPlans: ['enterprise', 'maas_enterprise'],
        upgradeUrl:  '/pricing#enterprise'
      });
    }

    // Attach plan context for downstream use
    req.planFeatures  = effectiveFeatures;
    req.resolvedPlan  = plan.name;
    next();

  } catch (err) {
    console.error('[requireMRVSubscription]', err.message);
    res.status(500).json({ success: false, error: 'Subscription check failed' });
  }
};

module.exports = requireMRVSubscription;
