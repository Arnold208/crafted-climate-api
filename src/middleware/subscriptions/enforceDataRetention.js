const getUserPlan = require("./getUserPlan");

async function enforceDataRetention(userid) {
  const { plan } = await getUserPlan(userid);

  // -1 means unlimited access to historical data
  if (plan.maxDataRetentionDays === -1) {
    return {}; // no filter
  }

  const cutoff = new Date(Date.now() - plan.maxDataRetentionDays * 24 * 60 * 60 * 1000);

  return { createdAt: { $gte: cutoff } };
}

module.exports = enforceDataRetention;
