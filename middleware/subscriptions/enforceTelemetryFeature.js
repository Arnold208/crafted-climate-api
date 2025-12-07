// middleware/subscriptions/enforceTelemetryFeature.js

const UserSubscription = require("../../model/subscriptions/UserSubscription");
const OrgSubscription = require("../../model/subscriptions/OrgSubscription");
const Plan = require("../../model/subscriptions/Plan");
const UsageLog = require("../../model/subscriptions/UsageLog");
const registerNewDevice = require("../../model/devices/registerDevice");

module.exports = function enforceTelemetryFeature({ feature, quotaKey, log }) {
  return async (req, res, next) => {
    try {
      let userid = req.user?.userid;
      let activeOrg = req.user?.activeOrg;

      // Device owner fallback (if needed)
      if (!userid && req.params.auid) {
        const dev = await registerNewDevice.findOne({ auid: req.params.auid });
        userid = dev?.userid || null;
      }

      if (!userid) {
        return res.status(401).json({
          message: "Unauthorized: Could not resolve user ID",
        });
      }

      let subscription;

      // 1️⃣ ORG SUBSCRIPTION
      if (activeOrg) {
        subscription = await OrgSubscription.findOne({ orgid: activeOrg });
      }

      // 2️⃣ PERSONAL SUBSCRIPTION (fallback)
      if (!subscription) {
        subscription = await UserSubscription.findOne({ userid });
      }

      if (!subscription || subscription.status !== "active") {
        return res.status(403).json({ message: "No active subscription" });
      }

      const plan = await Plan.findOne({ planId: subscription.planId });

      // FEATURE CHECK
      if (feature && !plan.features?.[feature]) {
        return res.status(403).json({
          message: `Your plan does not allow: ${feature}`,
        });
      }

      // QUOTA CHECK
      if (quotaKey && plan.quotas?.[quotaKey] !== undefined) {
        const allowed = plan.quotas[quotaKey];

        const used = await UsageLog.countDocuments({
          userid,
          type: quotaKey,
          createdAt: {
            $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        });

        if (used >= allowed) {
          return res.status(403).json({
            message: `Quota exceeded: ${quotaKey}`,
            used,
            allowed,
          });
        }
      }

      // LOG USAGE
      if (log) {
        await UsageLog.create({ userid, type: log });
      }

      next();

    } catch (err) {
      console.error("Telemetry enforcement error:", err);
      return res.status(500).json({
        message: "Internal telemetry middleware error",
        error: err.message,
      });
    }
  };
};
