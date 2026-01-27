/**
 * Check Platform Admin Middleware
 * Verifies that the user has platform admin role
 * 
 * 🔒 SECURITY: Prevents unauthorized access to admin-only endpoints
 */

const { hasPlatformPermission } = require('../../constants/organizationPermissions');

/**
 * Middleware to check if user is platform admin
 */
function checkPlatformAdmin(req, res, next) {
    try {
        // Check if user is authenticated
        if (!req.user || !req.user.platformRole) {
            return res.status(401).json({
                message: 'Authentication required'
            });
        }

        // Check if user has platform admin role
        if (!hasPlatformPermission(req.user.platformRole, 'platform:orgs:manage')) {
            return res.status(403).json({
                message: 'Forbidden. Platform admin access required.'
            });
        }

        next();
    } catch (error) {
        return res.status(500).json({
            message: 'Authorization check failed',
            error: error.message
        });
    }
}

module.exports = checkPlatformAdmin;
