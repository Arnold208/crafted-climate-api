const getUserPlan = require("./getUserPlan");

async function enforceDeviceLimit(userid) {
  const { sub, plan } = await getUserPlan(userid);

  // -1 means unlimited
  if (plan.maxDevices !== -1 && sub.usage.devicesCount >= plan.maxDevices) {
    throw new Error(`Device limit reached. Your plan allows max ${plan.maxDevices} devices.`);
  }

  return true;
}

module.exports = enforceDeviceLimit;
