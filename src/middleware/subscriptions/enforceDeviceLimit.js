const getUserPlan = require("./getUserPlan");

async function enforceDeviceLimit(userid, organizationId = null) {
  const { sub, plan } = await getUserPlan(userid, organizationId);

  // -1 means unlimited
  if (plan.maxDevices !== -1 && sub.usage.devicesCount >= plan.maxDevices) {
    const scope = organizationId ? "Organization" : "Personal";
    throw new Error(`${scope} device limit reached. Plan allows max ${plan.maxDevices} devices.`);
  }

  return true;
}

module.exports = enforceDeviceLimit;
