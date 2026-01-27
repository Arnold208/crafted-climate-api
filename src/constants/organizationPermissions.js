/**
 * Organization Permissions Constants
 * Defines granular permissions for organization roles
 */

const ORG_PERMISSIONS = {
    "org-admin": [
        "org:read",
        "org:update:name",
        "org:update:type",
        "org:update:description",
        "org:update:settings",
        "org:delete",
        "org:members:add",
        "org:members:remove",
        "org:members:update-role",
        "org:deployments:create",
        "org:deployments:update",
        "org:deployments:delete",
        "org:devices:add",
        "org:devices:remove",
        "org:verification:submit",
        "org:partner:apply"
    ],
    "org-support": [
        "org:read",
        "org:deployments:create",
        "org:deployments:update",
        "org:devices:add"
    ],
    "org:user": [
        "org:read"
    ]
};

const PLATFORM_PERMISSIONS = {
    "admin": [
        ...ORG_PERMISSIONS["org-admin"],
        "platform:users:manage",
        "platform:orgs:manage",
        "platform:verifications:review",
        "platform:partners:review",
        "platform:analytics:view"
    ],
    "support": [
        "platform:users:view",
        "platform:orgs:view",
        "platform:analytics:view"
    ],
    "user": []
};

/**
 * Check if a user has a specific permission
 * @param {string} role - User's role (org-admin, org-support, org-user)
 * @param {string} permission - Permission to check
 * @param {Array<string>} customPermissions - Optional custom permissions array
 * @returns {boolean}
 */
function hasPermission(role, permission, customPermissions = []) {
    const rolePermissions = ORG_PERMISSIONS[role] || [];
    return rolePermissions.includes(permission) || customPermissions.includes(permission);
}

/**
 * Check if a platform user has a specific permission
 * @param {string} platformRole - Platform role (admin, support, user)
 * @param {string} permission - Permission to check
 * @returns {boolean}
 */
function hasPlatformPermission(platformRole, permission) {
    const rolePermissions = PLATFORM_PERMISSIONS[platformRole] || [];
    return rolePermissions.includes(permission);
}

module.exports = {
    ORG_PERMISSIONS,
    PLATFORM_PERMISSIONS,
    hasPermission,
    hasPlatformPermission
};
