const authenticateToken = require('./bearermiddleware');

/**
 * Middleware to require platform admin role
 * Use after authenticateToken middleware
 */
function requirePlatformAdmin(req, res, next) {
    // Ensure user is authenticated first
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }

    // Check platform role
    if (req.user.platformRole !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Forbidden: Platform admin access required'
        });
    }

    next();
}

module.exports = requirePlatformAdmin;
