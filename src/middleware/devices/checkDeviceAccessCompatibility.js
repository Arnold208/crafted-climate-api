/**
 * Device Access Compatibility Helper
 * ──────────────────────────────────────────────────────────
 * 
 * Provides backward-compatible RBAC + multi-tenant access control
 * for both legacy and new devices.
 * 
 * A user may access a device if ANY of these are true:
 * 
 * 1. device.ownerUserId === req.user.userid (new ownership)
 * 2. device.userid === req.user.userid (legacy ownership)
 * 3. User is in device.collaborators[] (new RBAC)
 * 4. device.organizationId matches current org + org.devices.view permission
 * 5. Legacy access via direct ownership (fallback)
 * 
 * ──────────────────────────────────────────────────────────
 */

const Organization = require('../../models/organization/organizationModel');
const CacheService = require('../../modules/common/cache.service');

/**
 * Check if user has access to a device
 * @param {Object} req - Express request object (must have req.user)
 * @param {Object} device - Device document
 * @param {string} requiredPermission - Optional specific permission to check (e.g., "org.devices.edit")
 * @returns {Promise<boolean>} True if user has access, false otherwise
 */
async function checkDeviceAccessCompatibility(req, device, requiredPermission = null) {
  if (!req.user || !device) {
    console.log(`[DEBUG checkDeviceAccessCompatibility] Missing req.user or device. user: ${!!req.user}, device: ${!!device}`);
    return false;
  }

  const userId = req.user.userid;
  const currentOrgId = req.headers["x-org-id"] || req.user.currentOrganizationId;

  console.log(`[DEBUG checkDeviceAccessCompatibility] auid: "${device.auid}", ownerUserId: "${device.ownerUserId}", userid: "${device.userid}", userId: "${userId}", currentOrgId: "${currentOrgId}"`);

  // ──────────────────────────────────────────────────────────
  // 1. DIRECT OWNERSHIP (Legacy + New)
  // ──────────────────────────────────────────────────────────

  // New ownership field
  if (device.ownerUserId === userId) {
    console.log(`[DEBUG checkDeviceAccessCompatibility] Allowed: direct ownerUserId match`);
    return true;
  }

  // Legacy ownership field (for devices migrated before the split)
  if (device.userid === userId) {
    console.log(`[DEBUG checkDeviceAccessCompatibility] Allowed: direct legacy userid match`);
    return true;
  }

  // ──────────────────────────────────────────────────────────
  // 2. COLLABORATOR ACCESS (Device-level RBAC)
  // ──────────────────────────────────────────────────────────

  if (device.collaborators && Array.isArray(device.collaborators)) {
    const collaborator = device.collaborators.find(c => c.userid === userId);

    if (collaborator) {
      if (requiredPermission) {
        const action = requiredPermission.toLowerCase();

        if (action === 'delete') {
          const allowedRoles = ['device-admin', 'admin'];
          if (allowedRoles.includes(collaborator.role)) return true;
          if (collaborator.permissions && collaborator.permissions.includes('delete')) return true;
          return false;
        }

        if (action === 'share') {
          const allowedRoles = ['device-admin', 'admin'];
          if (allowedRoles.includes(collaborator.role)) return true;
          if (collaborator.permissions && collaborator.permissions.includes('share')) return true;
          return false;
        }

        if (action === 'control' || action === 'org.devices.control') {
          const allowedRoles = ['device-admin', 'device-support', 'admin', 'editor', 'support'];
          if (allowedRoles.includes(collaborator.role)) return true;
          if (collaborator.permissions && (collaborator.permissions.includes('control') || collaborator.permissions.includes('state'))) return true;
          return false;
        }

        if (action === 'edit' || action === 'update') {
          const allowedRoles = ['device-admin', 'admin', 'editor'];
          if (allowedRoles.includes(collaborator.role)) return true;
          if (collaborator.permissions && (collaborator.permissions.includes('edit') || collaborator.permissions.includes('update'))) return true;
          return false;
        }
      }

      // Default: Allow access for 'view' or unspecified permission
      return true;
    }
  }

  // ──────────────────────────────────────────────────────────
  // 3. ORGANIZATION-LEVEL ACCESS (Multi-tenant RBAC)
  // ──────────────────────────────────────────────────────────

  if (device.organizationId && currentOrgId === device.organizationId) {
    // User is in the same organization as the device

    // Injected by verifyOrgMembership middleware if org context exists
    if (req.orgMembership) {
      // FIX: Combine role-based permissions AND granular user permissions
      const { ORG_PERMISSIONS } = require('../../utils/permissions');
      const rolePermissions = ORG_PERMISSIONS[req.orgMembership.role] || [];
      const userPermissions = req.orgMembership.permissions || [];

      const distinctPermissions = new Set([...rolePermissions, ...userPermissions]);

      if (requiredPermission) {
        // Check for specific permission
        if (distinctPermissions.has(requiredPermission)) {
          return true;
        }
      } else {
        // Default: check for view permission
        if (distinctPermissions.has("org.devices.view")) {
          return true;
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  // 4. FALLBACK: Legacy device with no org context
  // ──────────────────────────────────────────────────────────

  // If no org context is available but device is owned by user,
  // allow access (backward compatibility for legacy clients)
  if (!currentOrgId && (device.userid === userId || device.ownerUserId === userId)) {
    return true;
  }

  // ──────────────────────────────────────────────────────────
  // Access Denied
  // ──────────────────────────────────────────────────────────

  console.log(`[DEBUG checkDeviceAccessCompatibility] Denied for auid: "${device.auid}"`);
  return false;
}

/**
 * Middleware wrapper that checks device access and returns 403 if denied
 * Usage: router.get('/:auid', authenticateToken, deviceAccessMiddleware, handler)
 */
function deviceAccessMiddleware(requiredPermission = null) {
  return async (req, res, next) => {
    try {
      const { auid, deviceId, devid } = req.params;
      const Device = require('../../models/devices/registerDevice');

      // Find device by various possible identifiers
      let device = null;
      if (auid) {
        // OPTIMIZATION: Cache device metadata by AUID (24h TTL)
        device = await CacheService.getOrSet(`device:${auid}:meta`, async () => {
          return await Device.findOne({ auid, deletedAt: null });
        }, 86400);
      } else if (deviceId) {
        device = await Device.findOne({ _id: deviceId, deletedAt: null });
      } else if (devid) {
        device = await Device.findOne({ devid, deletedAt: null });
      }

      if (!device) {
        return res.status(404).json({ message: "Device not found" });
      }

      // Check access
      const allowed = await checkDeviceAccessCompatibility(req, device, requiredPermission);
      if (!allowed) {
        return res.status(403).json({
          message: "Forbidden: You do not have access to this device"
        });
      }

      // Attach device to request for use in handler
      req.device = device;
      next();
    } catch (err) {
      console.error("Device access check error:", err);
      return res.status(500).json({
        message: "Error checking device access",
        error: err.message
      });
    }
  };
}

module.exports = {
  checkDeviceAccessCompatibility,
  deviceAccessMiddleware
};
