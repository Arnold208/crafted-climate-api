const UserSubscription = require('../../models/subscriptions/UserSubscription');
const Plan = require('../../models/subscriptions/Plan');

/**
 * Get User/Org Plan with Hierarchy Priority
 * @param {string} userid - The user ID (always required for fallback/context)
 * @param {string|null} organizationId - Optional Organization ID context
 */
async function getUserPlan(userid, organizationId = null) {
  let sub = null;

  if (organizationId) {
    // 1. Context: Organization (Enterprise/Team Plan)
    sub = await UserSubscription.findOne({
      organizationId,
      status: 'active'
    });
  }

  // 2. Context: Personal (Fallback or Explicit)
  if (!sub) {
    // Logic decision: If org provided but no sub found, do we fall back to personal? 
    // Standard SaaS: No. Org limits are Org limits. Personal limits are Personal.
    // However, if the Org has NO subscription, it might be a broken state or "Free Org" logic needed.
    // For now, if organizationId is provided, strict check.
    if (organizationId) {
      // Check if maybe the org uses the CREATOR'S personal plan? (Unlikely for "Professional" SaaS)
      // We assume Orgs must have their own subscription record (even if free).
      // If not found, searching specifically for Personal scope now.
    } else {
      sub = await UserSubscription.findOne({
        userid,
        subscriptionScope: 'personal',
        status: 'active'
      });
    }
  }

  // 3. Last Resort: Try finding ANY active sub for the user (Legacy/Safety)
  // Only if we strictly didn't ask for an Org context
  if (!sub && !organizationId) {
    sub = await UserSubscription.findOne({ userid, status: 'active' });
  }

  if (!sub) {
    throw new Error(organizationId
      ? "No active subscription found for this Organization."
      : "No active personal subscription found.");
  }

  if (sub.status !== "active") {
    throw new Error("Subscription is inactive. Please upgrade.");
  }

  // Fetch plan
  const plan = await Plan.findOne({ planId: sub.planId });

  if (!plan) {
    throw new Error("Subscription plan reference not found (Data integrity issue).");
  }

  if (!plan.isActive) {
    throw new Error("This subscription plan is deprecated or inactive.");
  }

  return { sub, plan };
}

module.exports = getUserPlan;
