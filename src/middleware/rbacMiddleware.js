// middleware/rbacMiddleware.js

/**
 * Role-based access control middleware
 * @param {...string} allowedRoles - e.g., 'admin', 'supervisor'
 * @returns middleware function
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      const userRole = req.user?.platformRole;

      if (!userRole) {
        return res.status(403).json({ message: 'No role assigned. Access denied.' });
      }

      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          message: `Access denied. Requires one of: ${allowedRoles.join(', ')}`,
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({ message: 'Error in role-based authorization.', error: error.message });
    }
  };
};

module.exports = authorizeRoles;
