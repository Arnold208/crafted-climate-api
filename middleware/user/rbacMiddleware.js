// middleware/rbacMiddleware.js

const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      const userRole = req.user?.role;

      // System-level role check
      if (allowedRoles.includes(userRole)) {
        return next();
      }

      // Organization-level check
      const orgid = req.user.activeOrg;
      if (orgid) {
        const orgRole = req.user.orgRoles?.[orgid];
        if (orgRole && allowedRoles.includes(orgRole)) {
          return next();
        }
      }

      return res.status(403).json({
        message: `Access denied. Requires one of: ${allowedRoles.join(", ")}`,
      });

    } catch (e) {
      return res.status(500).json({ message: "RBAC middleware error", error: e.message });
    }
  };
};

module.exports = authorizeRoles;
