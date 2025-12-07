// middleware/org/requireOrgPermission.js

/**
 * Require that the user has certain organization permissions.
 *
 * - If membership.permissions includes "*", allow everything.
 * - Otherwise check if all required permissions are present.
 */
function requireOrgPermission(...requiredPermissions) {
  return (req, res, next) => {
    try {
      const membership = req.orgMembership;
      if (!membership) {
        return res.status(500).json({
          message: "Org membership not loaded. Ensure orgContext middleware runs before this."
        });
      }

      const perms = membership.permissions || [];

      // Wildcard permission
      if (perms.includes("*")) {
        return next();
      }

      const missing = requiredPermissions.filter((p) => !perms.includes(p));

      if (missing.length > 0) {
        return res.status(403).json({
          message: "Missing organization permissions",
          required: requiredPermissions,
          missing
        });
      }

      return next();
    } catch (err) {
      console.error("requireOrgPermission error:", err);
      return res.status(500).json({
        message: "Internal server error (requireOrgPermission)",
        error: err.message
      });
    }
  };
}

module.exports = requireOrgPermission;
