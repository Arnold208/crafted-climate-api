const getUserPlan = require("./getUserPlan");

async function enforceDataRetention(userid, organizationId = null) {
  const { plan } = await getUserPlan(userid, organizationId);

  // -1 means unlimited access to historical data
  if (plan.maxDataRetentionDays === -1 || !plan.maxDataRetentionDays) {
    return {}; // no filter
  }

  const cutoff = new Date(Date.now() - plan.maxDataRetentionDays * 24 * 60 * 60 * 1000);

  // Use transport_time as it's the standard for historical queries
  return { transport_time: { $gte: cutoff } };
}

module.exports = enforceDataRetention;
