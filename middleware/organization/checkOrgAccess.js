/**
 * Organization RBAC Access Middleware
 * -----------------------------------
 * Validates that:
 *  1. User belongs to the selected organization
 *  2. User has the required organization role
 *  3. User's role includes the required permission
 *
 * This enforces strong tenant isolation + RBAC for all org-scoped routes.
 */

const Organization = require('../../model/organization/organizationModel');
const { ORG_PERMISSIONS } = require('../../utils/permissions');

module.exports = function checkOrgAccess(requiredPermission) {
    return async function (req, res, next) {
        try {
            // 1. User must already be authenticated (JWT middleware)
            const user = req.user;
            if (!user) {
                return res.status(401).json({ message: "Unauthorized: Missing user context" });
            }

            // 2. Get the organization the user wants to access
            const orgId = req.headers['x-org-id'] || user.currentOrganizationId;
            if (!orgId) {
                return res.status(400).json({ message: "No organization selected" });
            }

            req.currentOrgId = orgId; // attach for downstream handlers

            // 3. Load the organization
            const organization = await Organization.findOne({ organizationId: orgId });
            if (!organization) {
                return res.status(404).json({ message: "Organization not found" });
            }

            // 4. Check membership
            const membership = organization.collaborators.find(
                c => c.userid === user.userid
            );

            if (!membership) {
                return res.status(403).json({
                    message: "Forbidden: You do not belong to this organization"
                });
            }

            const userOrgRole = membership.role; // org-admin | org-support | org-user

            // 5. Load allowed permissions for this role
            const allowedPermissions = ORG_PERMISSIONS[userOrgRole];

            if (!allowedPermissions) {
                return res.status(403).json({
                    message: "Invalid or unrecognized organization role",
                    yourRole: userOrgRole
                });
            }

            // 6. Check if role grants the required action
            if (!allowedPermissions.includes(requiredPermission)) {
                return res.status(403).json({
                    message: "Forbidden: insufficient permissions",
                    requiredPermission,
                    yourRole: userOrgRole
                });
            }

            // 7. Authorized
            return next();

        } catch (error) {
            console.error("RBAC error:", error);
            return res.status(500).json({
                message: "Internal RBAC error",
                error: error.message
            });
        }
    };
};
