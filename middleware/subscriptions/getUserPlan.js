// middleware/subscriptions/getUserPlan.js

const UserSubscription = require("../../model/subscriptions/UserSubscription");
const OrgSubscription = require("../../model/subscriptions/OrgSubscription");
const Plan = require("../../model/subscriptions/Plan");

async function getUserPlan(userid, activeOrg = null) {
  let subscription;

  if (activeOrg) {
    subscription = await OrgSubscription.findOne({ orgid: activeOrg });
  }
  if (!subscription) {
    subscription = await UserSubscription.findOne({ userid });
  }

  if (!subscription) throw new Error("No active subscription found");
  if (subscription.status !== "active") throw new Error("Subscription inactive");

  const plan = await Plan.findOne({ planId: subscription.planId });
  if (!plan) throw new Error("Plan not found");
  if (!plan.isActive) throw new Error("Plan is inactive");

  return {
    source: activeOrg ? "organization" : "personal",
    subscription,
    plan,
  };
}

module.exports = getUserPlan;
