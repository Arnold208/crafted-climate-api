// middleware/subscriptions/requirePlanFeature.js

/**
 * Enforces that the current subscription plan includes a specific feature.
 *
 * Requires subscriptionContext to have set:
 *  - req.plan
 *
 * Example:
 *   router.put(
 *     "/user/:userid/device/:auid/update",
 *     authenticateToken,
 *     subscriptionContext({ mode: "auto" }),
 *     requirePlanFeature("device_update"),
 *     handler
 *   );
 */
function requirePlanFeature(featureName) {
  return (req, res, next) => {
    try {
      const plan = req.plan;
      if (!plan) {
        return res.status(500).json({
          message: "Subscription plan not loaded. Ensure subscriptionContext middleware runs before this."
        });
      }

      const features = plan.features || {};
      const allowed = features[featureName];

      if (!allowed) {
        return res.status(403).json({
          message: `Your current plan does not allow the feature: ${featureName}`
        });
      }

      return next();
    } catch (err) {
      console.error("requirePlanFeature error:", err);
      return res.status(500).json({
        message: "Internal server error (requirePlanFeature)",
        error: err.message
      });
    }
  };
}

module.exports = requirePlanFeature;
