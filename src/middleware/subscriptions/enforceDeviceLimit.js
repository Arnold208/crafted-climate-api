const getUserPlan = require("./getUserPlan");
const registerNewDevice = require("../../models/devices/registerDevice");

async function enforceDeviceLimit(userid, organizationId = null) {
  const { sub, plan } = await getUserPlan(userid, organizationId);

  // Use the organization ID from subscription if not explicitly provided (e.g. personal subscription)
  const targetOrgId = organizationId || sub.organizationId;

  // Calculate actual count dynamically to prevent cache out-of-sync issues
  const countQuery = targetOrgId 
    ? { organizationId: targetOrgId } 
    : { userid, organizationId: null };
  const count = await registerNewDevice.countDocuments(countQuery);

  // -1 or null/undefined means unlimited
  if (plan.maxDevices !== -1 && plan.maxDevices !== null && plan.maxDevices !== undefined && count >= plan.maxDevices) {
    const scope = organizationId ? "Organization" : "Personal";
    throw new Error(`${scope} device limit reached. Plan allows max ${plan.maxDevices} devices.`);
  }

  return true;
}

module.exports = enforceDeviceLimit;
