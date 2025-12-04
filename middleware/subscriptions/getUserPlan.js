const UserSubscription = require("../../model/subscriptions/UserSubscription");
const Plan = require("../../model/subscriptions/Plan");

async function getUserPlan(userid) {
  const sub = await UserSubscription.findOne({ userid });

  if (!sub) {
    throw new Error("No active subscription found for this user.");
  }

  if (sub.status !== "active") {
    throw new Error("User subscription is inactive. Please upgrade your plan.");
  }

  // Fetch plan using UUID planId
  const plan = await Plan.findOne({ planId: sub.planId });

  if (!plan) {
    throw new Error("Subscription plan not found.");
  }

  if (!plan.isActive) {
    throw new Error("This subscription plan is no longer active.");
  }

  return { sub, plan };
}

module.exports = getUserPlan;
