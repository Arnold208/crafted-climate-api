/**
 * Verify Organization Role Middleware
 * ===================================
 * Validates that user's org-role has the required permission.
 * 
 * Must be called AFTER verifyOrgMembership (which sets req.currentOrgRole).
 * 
 * Usage: verifyOrgRole("org.deployments.edit")
 */

const { ORG_PERMISSIONS } = require('../../utils/permissions');

module.exports = function verifyOrgRole(requiredPermission) {
  return (req, res, next) => {
    try {
      // Must have org context from verifyOrgMembership
      if (!req.currentOrgRole) {
        return res.status(403).json({
          message: "Missing organization role context"
        });
      }

      const userOrgRole = req.currentOrgRole; // org-admin | org-support | org-user

      // 2. Load allowed permissions for this role
      const allowedPermissions = ORG_PERMISSIONS[userOrgRole];

      if (!allowedPermissions) {
        return res.status(403).json({
          message: "Invalid or unrecognized organization role",
          yourRole: userOrgRole
        });
      }

      // 3. Check if role grants the required permission
      if (!allowedPermissions.includes(requiredPermission)) {
        return res.status(403).json({
          message: "Forbidden: insufficient permissions for this action",
          requiredPermission,
          yourRole: userOrgRole
        });
      }

      // 4. Authorized
      next();

    } catch (error) {
      console.error("Organization role verification error:", error);
      return res.status(500).json({
        message: "Internal error verifying organization role",
        error: error.message
      });
    }
  };
};
