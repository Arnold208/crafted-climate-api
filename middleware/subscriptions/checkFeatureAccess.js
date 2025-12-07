// middleware/subscriptions/checkFeatureAccess.js

const UserSubscription = require("../../model/subscriptions/UserSubscription");
const OrgSubscription = require("../../model/subscriptions/OrgSubscription");
const Plan = require("../../model/subscriptions/Plan");

function checkFeatureAccess(featureName) {
  return async (req, res, next) => {
    try {
      const userid = req.user?.userid;
      const activeOrg = req.user?.activeOrg;

      if (!userid) return res.status(401).json({ message: "Missing user ID" });

      let subscription;

      /**
       * 1️⃣ ORG SUBSCRIPTION (highest priority)
       */
      if (activeOrg) {
        subscription = await OrgSubscription.findOne({ orgid: activeOrg });
      }

      /**
       * 2️⃣ PERSONAL SUBSCRIPTION (fallback)
       */
      if (!subscription) {
        subscription = await UserSubscription.findOne({ userid });
      }

      if (!subscription || subscription.status !== "active") {
        return res.status(403).json({ message: "No active subscription found" });
      }

      const plan = await Plan.findOne({ planId: subscription.planId });
      if (!plan) return res.status(403).json({ message: "Subscription plan not found" });

      const allowed = plan.features?.[featureName];
      if (!allowed) {
        return res.status(403).json({
          message: `Your plan does not allow feature: ${featureName}`,
        });
      }

      next();
    } catch (err) {
      res.status(500).json({ error: "Feature access check error", details: err.message });
    }
  };
}

module.exports = checkFeatureAccess;
