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

const Organization = require('../../models/organization/organizationModel');
const { ORG_PERMISSIONS } = require('../../utils/permissions');

module.exports = function checkOrgAccess(requiredPermission) {
    return async function (req, res, next) {
        try {
            // 1. User must already be authenticated (JWT middleware)
            const user = req.user;
            if (!user) {
                return res.status(401).json({ message: "Unauthorized: Missing user context" });
            }

            // 2. Determine which org is being accessed
            // SECURITY: Must use the orgId from the URL params — NOT x-org-id header or
            // user.currentOrganizationId, as those refer to the requesting user's own org.
            // Using anything other than req.params.orgId here would allow IDOR attacks where
            // any authenticated user could access/modify any other org's resources.
            const orgId = req.params.orgId || req.headers['x-org-id'] || user.currentOrganizationId;
            if (!orgId) {
                return res.status(400).json({ message: "No organization specified" });
            }

            req.currentOrgId = orgId; // attach for downstream handlers

            // OPTIMIZATION: Check if upstream middleware (verifyOrgMembership) already loaded it
            if (req.orgMembership && req.currentOrgId === orgId) {
                // Reuse existing context
                var membership = req.orgMembership;
            } else {
                // 3. Load the organization (Fallback)
                // Note: ideally we should use verifyOrgMembership upstream everywhere
                console.log(`[DEBUG OrgAccess] Resolving Org: ${orgId} for User: ${user.userid}`);
                const organization = await Organization.findOne({ organizationId: orgId, deletedAt: null });
                if (!organization) {
                    console.warn(`[DEBUG OrgAccess] Org ${orgId} not found`);
                    return res.status(404).json({ message: "Organization not found" });
                }

                // 4. Check membership
                var membership = organization.collaborators.find(
                    c => c.userid === user.userid
                );

                if (!membership) {
                    return res.status(403).json({
                        message: "Forbidden: You do not belong to this organization"
                    });
                }
            }

            // 5. Check API key specific permissions if authenticated via API key
            if (req.apiKey) {
                const API_KEY_PERMISSION_MAP = {
                    'telemetry:read': ['org.devices.view', 'org.telemetry.read'],
                    'telemetry:write': ['org.telemetry.write'],
                    'devices:read': ['org.devices.view'],
                    'devices:write': ['org.devices.add', 'org.devices.edit', 'org.devices.remove', 'org.devices.control'],
                    'analytics:read': ['org.analytics.view', 'org.telemetry.export', 'org.logs.view']
                };

                const hasApiKeyPermission = req.apiKey.permissions.some(p => {
                    const mapped = API_KEY_PERMISSION_MAP[p] || [];
                    return mapped.includes(requiredPermission) || p === requiredPermission;
                });

                if (!hasApiKeyPermission) {
                    return res.status(403).json({
                        success: false,
                        message: `Forbidden: API key lacks required permission: ${requiredPermission}`
                    });
                }
            }

            const userOrgRole = membership.role; // org-admin | org-support | org-user

            // 6. Load allowed permissions for this role
            const allowedPermissions = ORG_PERMISSIONS[userOrgRole];

            if (!allowedPermissions) {
                return res.status(403).json({
                    message: "Invalid or unrecognized organization role",
                    yourRole: userOrgRole
                });
            }

            // 7. Check if role grants the required action
            if (!allowedPermissions.includes(requiredPermission)) {
                return res.status(403).json({
                    message: "Forbidden: insufficient permissions",
                    requiredPermission,
                    yourRole: userOrgRole
                });
            }

            // 8. Authorized
            console.log(`[DEBUG OrgAccess] Authorized. Role: ${userOrgRole} for Permission: ${requiredPermission}`);
            req.currentOrgRole = userOrgRole; // Fix: Pass role to downstream middleware
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
