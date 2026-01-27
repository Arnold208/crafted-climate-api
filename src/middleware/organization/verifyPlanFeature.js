/**
 * Verify Plan Feature Middleware
 * ============================
 * Validates that user's subscription plan includes the required feature.
 * 
 * Must be called AFTER authenticateToken (req.user set).
 * 
 * Usage: verifyPlanFeature("device_update")
 * 
 * Resolves user's plan by checking:
 *  1. Personal org subscription (if accessing personal workspace)
 *  2. Enterprise org subscription (if accessing enterprise org)
 */

const UserSubscription = require('../../models/subscriptions/UserSubscription');
const Plan = require('../../models/subscriptions/Plan');
const Organization = require('../../models/organization/organizationModel');
const { PLAN_FEATURES } = require('../../config/planFeatures');

module.exports = function verifyPlanFeature(featureName) {
  return async (req, res, next) => {
    try {
      const userid = req.user?.userid;
      if (!userid) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Determine which plan to check
      // If org context exists, check org subscription
      // Otherwise check user's personal plan
      
      let planId = null;
      let orgId = req.currentOrgId || req.headers['x-org-id'] || req.user.currentOrganizationId;

      if (orgId) {
        // Get org subscription
        const orgSubscription = await UserSubscription.findOne({
          organizationId: orgId,
          subscriptionScope: "organization",
          status: "active"
        });

        if (orgSubscription) {
          planId = orgSubscription.planId;
        }
      }

      // If no org subscription, check user's personal subscription
      if (!planId) {
        const userSubscription = await UserSubscription.findOne({
          userid,
          subscriptionScope: "user",
          status: "active"
        });

        if (userSubscription) {
          planId = userSubscription.planId;
        }
      }

      if (!planId) {
        return res.status(403).json({
          message: "No active subscription found"
        });
      }

      // Get plan details
      const plan = await Plan.findOne({ planId });
      if (!plan) {
        return res.status(403).json({
          message: "Subscription plan not found"
        });
      }

      // Check if feature is enabled on plan
      const featureAllowed = plan.features?.[featureName];

      if (!featureAllowed) {
        return res.status(403).json({
          message: `Your current plan does not include the feature: ${featureName}`,
          planName: plan.name,
          requiredFeature: featureName
        });
      }

      // Attach plan info for downstream handlers
      req.activePlan = plan;
      next();

    } catch (err) {
      console.error(`Feature verification error for ${featureName}:`, err);
      res.status(500).json({
        message: "Server error checking feature permissions",
        error: err.message
      });
    }
  };
};
