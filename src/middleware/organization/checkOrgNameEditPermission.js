/**
 * Organization Name Edit Permission Middleware
 * Checks if user has permission to edit organization name
 * 
 * 🔒 SECURITY: Enforces org-admin role requirement
 */

const Organization = require('../../models/organization/organizationModel');
const { hasPermission } = require('../../constants/organizationPermissions');

/**
 * Middleware to check org name edit permission
 */
async function checkOrgNameEditPermission(req, res, next) {
    try {
        const { orgId } = req.params;
        const userid = req.user.userid;

        // Fetch organization
        const org = await Organization.findOne({
            organizationId: orgId,
            deletedAt: null
        });

        if (!org) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        // Check if user is a member
        const member = org.collaborators.find(c => c.userid === userid);
        if (!member) {
            return res.status(403).json({
                message: 'You are not a member of this organization'
            });
        }

        // Check if user has permission to edit name
        if (!hasPermission(member.role, 'org:update:name')) {
            return res.status(403).json({
                message: 'Insufficient permissions. Only org-admins can edit organization name.'
            });
        }

        // Attach org to request for use in controller
        req.organization = org;
        req.userOrgRole = member.role;

        next();
    } catch (error) {
        return res.status(500).json({
            message: 'Permission check failed',
            error: error.message
        });
    }
}

module.exports = checkOrgNameEditPermission;
