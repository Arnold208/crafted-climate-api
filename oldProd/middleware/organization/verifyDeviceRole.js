/**
 * Verify Device Role Middleware
 * ============================
 * Validates device-level permissions for shared/collaborative devices.
 * 
 * Device collaborators can have roles: device-admin, device-support, device-user
 * This checks if user has required permission on a specific device.
 * 
 * Usage: verifyDeviceRole("device.view")
 * 
 * Must be called AFTER device is loaded into req (e.g., by checkTelemetryReadAccess)
 */

const DEVICE_PERMISSIONS = {
  "device-admin": [
    "device.view",
    "device.edit",
    "device.delete",
    "device.share",
    "device.telemetry.read",
    "device.telemetry.export"
  ],

  "device-support": [
    "device.view",
    "device.edit",
    "device.telemetry.read",
    "device.telemetry.export"
  ],

  "device-user": [
    "device.view",
    "device.telemetry.read"
  ]
};

module.exports = function verifyDeviceRole(requiredPermission) {
  return (req, res, next) => {
    try {
      // Must have device context (set by checkTelemetryReadAccess or similar)
      if (!req.device) {
        return res.status(400).json({
          message: "Device context not found in request"
        });
      }

      const user = req.user;
      const device = req.device;

      // Find user's role on this device
      const collab = device.collaborators.find(c => c.userid === user.userid);
      if (!collab) {
        return res.status(403).json({
          message: "You do not have access to this device"
        });
      }

      const userDeviceRole = collab.role; // device-admin, device-support, device-user

      // Get allowed permissions for this role
      const allowedPermissions = DEVICE_PERMISSIONS[userDeviceRole] || [];

      // Check if role grants the required action
      if (!allowedPermissions.includes(requiredPermission)) {
        return res.status(403).json({
          message: "Insufficient device permissions",
          requiredPermission,
          yourRole: userDeviceRole
        });
      }

      next();

    } catch (error) {
      console.error("Device role verification error:", error);
      return res.status(500).json({
        message: "Internal error verifying device role",
        error: error.message
      });
    }
  };
};
