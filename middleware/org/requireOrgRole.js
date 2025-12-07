// middleware/org/requireOrgRole.js

/**
 * Require that the user has one of the allowed org roles.
 *
 * Needs orgContext to have already run and set req.orgMembership.
 *
 * Example:
 *   router.post(
 *     "/org/:orgid/settings",
 *     authenticateToken,
 *     orgContext,
 *     requireOrgRole("owner", "admin"),
 *     handler
 *   );
 */
function requireOrgRole(...allowedRoles) {
  return (req, res, next) => {
    try {
      const membership = req.orgMembership;
      if (!membership) {
        return res.status(500).json({
          message: "Org membership not loaded. Ensure orgContext middleware runs before this."
        });
      }

      if (!allowedRoles.includes(membership.role)) {
        return res.status(403).json({
          message: `Org access denied. Required roles: ${allowedRoles.join(", ")}`
        });
      }

      return next();
    } catch (err) {
      console.error("requireOrgRole error:", err);
      return res.status(500).json({ message: "Internal server error (requireOrgRole)", error: err.message });
    }
  };
}

module.exports = requireOrgRole;
