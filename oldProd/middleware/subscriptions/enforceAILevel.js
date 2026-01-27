const getUserPlan = require("./getUserPlan");

async function enforceAILevel(userid, requiredLevel) {
  const { plan } = await getUserPlan(userid);

  const levels = ["none", "basic", "moderate", "advanced"];

  if (levels.indexOf(plan.features.aiInsightsLevel) < levels.indexOf(requiredLevel)) {
    throw new Error(
      `Your plan does not include ${requiredLevel} AI insights. Please upgrade your plan.`
    );
  }

  return true;
}

module.exports = enforceAILevel;
