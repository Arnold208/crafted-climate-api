// middleware/subscriptions/subscriptionContext.js

const UserSubscription = require("../../model/subscriptions/UserSubscription");
const OrgSubscription = require("../../model/subscriptions/OrgSubscription");
const Plan = require("../../model/subscriptions/Plan");

/**
 * Determine subscription context: personal or organization.
 *
 * Modes:
 *  - "auto": if orgid is present, use org subscription; otherwise use personal
 *  - "personal": always use user's personal subscription
 *  - "organization": always use org subscription (requires req.orgid or parameter/header)
 */
function subscriptionContext({ mode = "auto" } = {}) {
  return async (req, res, next) => {
    try {
      const userid = req.user?.userid;
      if (!userid) {
        return res.status(401).json({ message: "Unauthenticated: missing userid" });
      }

      // Try to detect orgid context
      const headerOrgId = req.headers["x-org-id"] || req.headers["X-Org-Id"];
      const paramOrgId = req.params?.orgid;
      const bodyOrgId = req.body?.orgid;
      const orgid = headerOrgId || paramOrgId || bodyOrgId || req.orgid || null;

      let scope = "personal";
      let subscription = null;
      let plan = null;

      if (mode === "organization") {
        if (!orgid) {
          return res.status(400).json({ message: "Organization context required but orgid missing" });
        }
        scope = "organization";

      } else if (mode === "auto") {
        // auto-detect: if orgid present, treat as org-scope
        scope = orgid ? "organization" : "personal";
      } else if (mode === "personal") {
        scope = "personal";
      }

      if (scope === "personal") {
        subscription = await UserSubscription.findOne({ userid });
        if (!subscription || subscription.status !== "active") {
          return res.status(403).json({ message: "No active personal subscription" });
        }

        plan = await Plan.findOne({ planId: subscription.planId, isActive: true });
        if (!plan) {
          return res.status(500).json({ message: "Personal subscription plan not found or inactive" });
        }
      } else {
        // Organization scope
        if (!orgid) {
          return res.status(400).json({ message: "orgid is required for organization subscription context" });
        }

        subscription = await OrgSubscription.findOne({ orgid });
        if (!subscription || subscription.status !== "active") {
          return res.status(403).json({ message: "No active org subscription for this organization" });
        }

        plan = await Plan.findOne({ planId: subscription.planId, isActive: true });
        if (!plan) {
          return res.status(500).json({ message: "Organization subscription plan not found or inactive" });
        }
      }

      // Attach to request
      req.subscriptionScope = scope;
      req.subscriptionOrgid = scope === "organization" ? (orgid || subscription.orgid) : null;
      req.subscription = subscription;
      req.plan = plan;

      return next();
    } catch (err) {
      console.error("subscriptionContext error:", err);
      return res.status(500).json({
        message: "Internal server error (subscriptionContext)",
        error: err.message
      });
    }
  };
}

module.exports = subscriptionContext;
