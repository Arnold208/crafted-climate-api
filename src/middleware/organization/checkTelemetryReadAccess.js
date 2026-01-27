const registerNewDevice = require('../../models/devices/registerDevice');
const { ORG_PERMISSIONS } = require("../../utils/permissions");

module.exports = async function checkTelemetryReadAccess(req, res, next) {
  try {
    const { auid } = req.params;
    const user = req.user;
    const orgId = req.currentOrgId;

    // 1 — Fetch device
    const device = await registerNewDevice.findOne({ auid });
    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    // 2 — Tenant isolation
    if (device.organization !== orgId) {
      return res.status(403).json({
        message: "Forbidden: Device belongs to another organization"
      });
    }

    // 3 — Get user’s org-role
    const orgRole = req.currentOrgRole;
    const allowed = ORG_PERMISSIONS[orgRole] || [];

    // MUST HAVE org.devices.view
    if (!allowed.includes("org.devices.view")) {
      return res.status(403).json({
        message: "Forbidden: No permission to view device telemetry"
      });
    }

    // 4 — Org-user must be collaborator
    if (orgRole === "org-user") {
      const collab = device.collaborators.some(c => c.userid === user.userid);
      if (!collab) {
        return res.status(403).json({
          message: "Device not shared with you"
        });
      }
    }

    req.device = device;
    next();
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
