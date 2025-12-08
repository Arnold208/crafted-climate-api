/**
 * RBAC Permission Matrix for Organization-Level Access
 * ----------------------------------------------------
 * Defines the authorization capabilities for each role within an organization.
 * Each route requiring organization-level access uses this matrix through the
 * checkOrgAccess(permission) middleware.
 *
 * Permission categories:
 * ----------------------
 * org.manage             → Full organization settings access
 * org.users.*            → Invite/remove/modify organization members
 * org.deployments.*      → Manage deployments
 * org.devices.*          → Register/manage devices
 * org.billing.*          → View & update billing/subscriptions
 * org.analytics.*        → Access org dashboards, reports
 * org.audit.*            → Access logs and system events (optional future use)
 */

const ORG_PERMISSIONS = {

  /* ============================================================
   * ROLE: ORG-ADMIN
   * Full administrative access inside the organization.
   * Equivalent to "admin" but scoped to the org only.
   * ============================================================ */
  "org-admin": [

    /* Organization Management */
    "org.manage",

    /* User Management */
    "org.users.invite",
    "org.users.remove",
    "org.users.change-role",
    "org.users.view",

    /* Deployments */
    "org.deployments.create",
    "org.deployments.view",
    "org.deployments.edit",
    "org.deployments.delete",

    /* Devices */
    "org.devices.add",
    "org.devices.view",
    "org.devices.edit",
    "org.devices.remove",
    "org.telemetry.read",

    /* Thresholds */
    "org.thresholds.create",
    "org.thresholds.view",
    "org.thresholds.edit",
    "org.thresholds.delete",

    /* Notecard Configuration */
    "org.notecard.create",
    "org.notecard.view",
    "org.notecard.edit",
    "org.notecard.delete",

    /* Billing */
    "org.billing.view",
    "org.billing.update",

    /* Analytics */
    "org.analytics.view",

    /* Audit / Logs */
    "org.logs.view"
  ],


  /* ============================================================
   * ROLE: ORG-SUPPORT
   * Operational support role. Can NOT manage users or billing.
   * Has limited write access.
   * ============================================================ */
  "org-support": [

    /* View Only Org Users */
    "org.users.view",

    /* Deployments */
    "org.deployments.view",
    "org.deployments.edit",     // can adjust, not delete or create

    /* Devices */
    "org.devices.view",
    "org.devices.edit",         // can update alias, location, not remove

    /* Thresholds */
    "org.thresholds.view",
    "org.thresholds.edit",
    "org.thresholds.create",
    "org.thresholds.delete",

    /* Notecard Configuration */
    "org.notecard.view",
    "org.notecard.edit",
    "org.notecard.create",
    "org.notecard.delete",

    /* Analytics */
    "org.analytics.view",
    "org.telemetry.read",

    /* Audit / Logs */
    "org.logs.view"
  ],


  /* ============================================================
   * ROLE: ORG-USER
   * Regular user with read-only permissions + threshold/notecard update.
   * Can view and update thresholds/notecard, but not create/delete.
   * ============================================================ */
  "org-user": [

    "org.users.view",

    /* Read-only Access */
    "org.deployments.view",
    "org.devices.view",
    "org.analytics.view",
    "org.telemetry.read",

    /* Thresholds - Read & Update only */
    "org.thresholds.view",
    "org.thresholds.edit",

    /* Notecard Configuration - Read & Update only */
    "org.notecard.view",
    "org.notecard.edit"
  ]
};

/**
 * RBAC Permission Matrix for Platform-Level Access
 * --------------------------------------------------
 * Defines platform-wide permissions for system administrators.
 * Platform-level permissions are checked against user.platformRole.
 *
 * Permission categories:
 * ----------------------
 * platform.logs.view     → Access system-wide audit logs
 */

const PLATFORM_PERMISSIONS = {

  /* ============================================================
   * ROLE: platform-admin
   * Full platform-wide access.
   * ============================================================ */
  "platform-admin": [
    "platform.logs.view"
  ],

  /* ============================================================
   * ROLE: admin (Platform)
   * Alias for platform-admin for backward compatibility.
   * ============================================================ */
  "admin": [
    "platform.logs.view"
  ],

  /* ============================================================
   * ROLE: super-admin
   * Super admin role CANNOT access org logs (tenant isolation).
   * Can ONLY access platform logs.
   * ============================================================ */
  "super-admin": [
    "platform.logs.view"
  ]
};

module.exports = {
  ORG_PERMISSIONS,
  PLATFORM_PERMISSIONS
};
