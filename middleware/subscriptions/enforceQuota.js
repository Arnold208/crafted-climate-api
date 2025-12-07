// middleware/subscriptions/enforceQuota.js

const UsageLog = require("../../model/subscriptions/UsageLog");

/**
 * Enforce a quota based on plan.quotas[quotaKey].
 *
 * Options:
 *  - period: "month" | "day" | "year" (default "month")
 *  - logType: string to store in UsageLog.type (e.g., "apiCall", "dataExport")
 *
 * Requires:
 *  - req.plan
 *  - req.user.userid
 *  - (optional) req.subscriptionOrgid for org context
 *
 * NOTE:
 *  You can combine this with subscriptionContext({ mode: "auto" })
 *  so it works for both personal and org scopes.
 */
function enforceQuota(quotaKey, { period = "month", logType = null } = {}) {
  return async (req, res, next) => {
    try {
      const plan = req.plan;
      const userid = req.user?.userid;

      if (!plan || !userid) {
        return res.status(500).json({
          message: "Plan or user not loaded. Ensure subscriptionContext and authenticateToken run before this."
        });
      }

      const quotas = plan.quotas || {};
      const allowed = quotas[quotaKey];

      // If no quota set → no enforcement
      if (typeof allowed !== "number" || allowed <= 0) {
        return next();
      }

      // Determine time window
      const now = new Date();
      let periodStart;

      if (period === "day") {
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (period === "year") {
        periodStart = new Date(now.getFullYear(), 0, 1);
      } else {
        // default: month
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      const filter = {
        userid,
        type: quotaKey,
        createdAt: { $gte: periodStart }
      };

      // If org context is present, track by org as well
      if (req.subscriptionOrgid) {
        filter.orgid = req.subscriptionOrgid;
      }

      const used = await UsageLog.countDocuments(filter);

      if (used >= allowed) {
        return res.status(403).json({
          message: `Quota exceeded for: ${quotaKey}`,
          allowed,
          used
        });
      }

      // If we want to log this event, do it here
      if (logType || quotaKey) {
        await UsageLog.create({
          userid,
          orgid: req.subscriptionOrgid || null,
          type: logType || quotaKey,
          meta: {
            path: req.originalUrl,
            method: req.method
          }
        });
      }

      return next();
    } catch (err) {
      console.error("enforceQuota error:", err);
      return res.status(500).json({
        message: "Internal server error (enforceQuota)",
        error: err.message
      });
    }
  };
}

module.exports = enforceQuota;
