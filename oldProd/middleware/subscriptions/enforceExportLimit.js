const UserSubscription = require("../../model/subscriptions/UserSubscription");
const getUserPlan = require("./getUserPlan");

async function enforceExportLimit(userid) {
  const { plan, sub } = await getUserPlan(userid);

  if (!plan.features.exportEnabled) {
    throw new Error("Data export is not included in your subscription plan.");
  }

  if (plan.maxDataExportMonths === 0) {
    throw new Error("Your plan does not allow CSV exports.");
  }

  // Optional: limit # of exports per month
  if (sub.usage.exportsThisMonth >= 20) {
    throw new Error("Monthly export limit reached for your plan.");
  }

  // increment export usage counter
  await UserSubscription.updateOne(
    { userid },
    { $inc: { "usage.exportsThisMonth": 1 } }
  );

  return true;
}

module.exports = enforceExportLimit;
