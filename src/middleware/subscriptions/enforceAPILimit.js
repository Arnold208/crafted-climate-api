const UserSubscription = require('../../models/subscriptions/UserSubscription');
const getUserPlan = require("./getUserPlan");

async function enforceAPILimit(userid) {
  const { plan, sub } = await getUserPlan(userid);

  if (plan.features.apiAccess === "none") {
    throw new Error("API access is not included in your current subscription plan.");
  }

  if (plan.features.apiAccess === "limited") {
    const maxCalls = plan.features.maxApiCallsPerMonth || 1000;
    if (sub.usage.apiCallsThisMonth >= maxCalls) {
      throw new Error("Monthly API call limit reached for your plan.");
    }
  }

  // increment API usage counter
  await UserSubscription.updateOne(
    { userid },
    { $inc: { "usage.apiCallsThisMonth": 1 } }
  );

  return true;
}

module.exports = enforceAPILimit;
