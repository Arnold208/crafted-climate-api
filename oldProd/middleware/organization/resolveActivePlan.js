/**
 * Resolve Active Plan Utility
 * ==========================
 * Helper function to determine which subscription plan applies to a user/org context.
 * 
 * Priority:
 *  1. Organization subscription (if orgId provided)
 *  2. User personal subscription
 *  3. Fallback to freemium
 */

const UserSubscription = require('../../model/subscriptions/UserSubscription');
const Plan = require('../../model/subscriptions/Plan');

/**
 * @param {string} userid - User ID
 * @param {string} orgId - Organization ID (optional)
 * @returns {Promise<Object>} Plan object or null
 */
async function resolveActivePlan(userid, orgId = null) {
  try {
    let planId = null;

    // 1. Check organization subscription first
    if (orgId) {
      const orgSubscription = await UserSubscription.findOne({
        organizationId: orgId,
        subscriptionScope: "organization",
        status: "active"
      });

      if (orgSubscription) {
        planId = orgSubscription.planId;
      }
    }

    // 2. If no org subscription, check user's personal subscription
    if (!planId) {
      const userSubscription = await UserSubscription.findOne({
        userid,
        subscriptionScope: "user",
        status: "active"
      });

      if (userSubscription) {
        planId = userSubscription.planId;
      }
    }

    // 3. Get plan details
    if (planId) {
      const plan = await Plan.findOne({ planId });
      return plan || null;
    }

    return null;

  } catch (error) {
    console.error("Error resolving active plan:", error);
    return null;
  }
}

module.exports = { resolveActivePlan };
