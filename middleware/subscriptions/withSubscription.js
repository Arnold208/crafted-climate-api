// middleware/subscriptions/withSubscription.js

const subscriptionContext = require("./subscriptionContext");
const requirePlanFeature = require("./requirePlanFeature");
const enforceQuota = require("./enforceQuota");

/**
 * High-level middleware that:
 *  1. Resolves subscription context (personal or org)
 *  2. Optionally checks for a required feature
 *  3. Optionally enforces a quota and logs usage
 *
 * Usage:
 *   router.post(
 *     "/api/devices/register-device",
 *     authenticateToken,
 *     withSubscription({
 *       mode: "auto",
 *       feature: "device_update",
 *       quotaKey: "deviceRegistered",
 *       quotaPeriod: "month"
 *     }),
 *     handler
 *   );
 */
function withSubscription(options = {}) {
  const {
    mode = "auto",
    feature = null,
    quotaKey = null,
    quotaPeriod = "month",
    quotaLogType = null
  } = options;

  // We dynamically build a middleware chain
  const chain = [
    subscriptionContext({ mode })
  ];

  if (feature) {
    chain.push(requirePlanFeature(feature));
  }

  if (quotaKey) {
    chain.push(enforceQuota(quotaKey, { period: quotaPeriod, logType: quotaLogType }));
  }

  return async (req, res, next) => {
    let i = 0;

    const run = async (err) => {
      if (err) return next(err);
      if (i >= chain.length) return next();
      const fn = chain[i++];
      try {
        await fn(req, res, run);
      } catch (e) {
        return next(e);
      }
    };

    return run();
  };
}

module.exports = withSubscription;

