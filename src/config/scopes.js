'use strict';

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║          CRAFTED CLIMATE — PLATFORM SCOPE REGISTRY                      ║
 * ║                                                                          ║
 * ║  Single source of truth for every API permission scope.                  ║
 * ║                                                                          ║
 * ║  FORMAT:  resource:subresource:action                                    ║
 * ║                                                                          ║
 * ║  Used by:                                                                ║
 * ║    - ApiKey model (permissions enum)                                     ║
 * ║    - apiKey.service.js (scope ceiling validation against org)            ║
 * ║    - authenticateApiKey.js (requirePermission middleware)                ║
 * ║    - checkOrgAccess.js (API key → org permission mapping)                ║
 * ║    - GET /api/admin/api-keys/scopes (admin reference endpoint)           ║
 * ║                                                                          ║
 * ║  Rules:                                                                  ║
 * ║    - Admin-only scopes (admin:*) are NEVER issued to partner keys        ║
 * ║    - Billing scopes are NEVER issued to partner keys                     ║
 * ║    - All other scopes can be granted by a CC admin                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

// ─── Scope Groups ──────────────────────────────────────────────────────────────

const MRV_SCOPES = [
  // Projects
  'mrv:projects:read',           // List & view MRV projects
  'mrv:projects:write',          // Create & update MRV projects

  // Monitoring periods
  'mrv:monitoring:read',         // View monitoring periods and status
  'mrv:monitoring:write',        // Open / close monitoring periods

  // Reports (JSON + PDF)
  'mrv:reports:read',            // Fetch structured JSON report data
  'mrv:reports:download',        // Download branded PDF report

  // Evidence & observations
  'mrv:evidence:read',           // View observations, validation runs, telemetry receipts
  'mrv:evidence:write',          // Submit manual observations, upload evidence files

  // Calibrations
  'mrv:calibrations:read',       // View calibration records
  'mrv:calibrations:write',      // Create / update calibration records

  // Analytics
  'mrv:analytics:read',          // Project summary, time-series, device performance, portfolio

  // Catalogue (standards & methodologies — always read-only)
  'mrv:catalogue:read',          // List standards, methodologies, sensor capability mappings

  // Webhooks
  'mrv:webhooks:manage',         // Register / update partner webhook endpoints for MRV events

  // Data quality (assurance layer)
  'mrv:data-quality:read',       // View validation runs, data quality flags
  'mrv:data-quality:write',      // Approve / void quarantined observations (VVB / admin use)

  // VVB (Validation & Verification Body) read-only data room
  'mrv:vvb:read',                // Access VVB data room endpoints (evidence, reports, completeness)
];

const DEVICE_SCOPES = [
  'devices:read',                // List & view device metadata and status
  'devices:write',               // Register & update devices
  'devices:telemetry:read',      // Read historical raw telemetry records
];

const TELEMETRY_SCOPES = [
  'telemetry:read',              // Query ingested telemetry data
  'telemetry:write',             // Ingest telemetry via REST (non-MQTT path)
  'telemetry:ingest',            // Push telemetry (for IoT hardware partners & edge gateways)
];

const ANALYTICS_SCOPES = [
  'analytics:read',              // Platform-wide analytics endpoints
];

const ORGANIZATION_SCOPES = [
  'organizations:read',          // View org profile and member list (own org only)
];

const NOTIFICATION_SCOPES = [
  'notifications:read',          // Read notification feed for the partner's org
];

const SUBSCRIPTION_SCOPES = [
  'subscriptions:read',          // Read own subscription and usage stats
];

const LOG_SCOPES = [
  'logs:read',                   // Read device and system logs (own org only)
];

const WEBHOOK_SCOPES = [
  'webhooks:manage',             // Register / update partner's own webhook subscriptions
];

// ─── Admin-only scopes — NEVER issued to partner keys ─────────────────────────
// Listed here for completeness and documentation; blocked at key-generation time.
const ADMIN_ONLY_SCOPES = [
  'admin:users:read',
  'admin:users:write',
  'admin:organizations:read',
  'admin:organizations:write',
  'admin:api-keys:manage',
  'admin:subscriptions:manage',
  'admin:system:config',
  'admin:audit-logs:read',
  'admin:analytics:read',
  'billing:read',
  'billing:write',
];

// ─── All partner-issuable scopes (flat list) ──────────────────────────────────
const PARTNER_SCOPES = [
  ...MRV_SCOPES,
  ...DEVICE_SCOPES,
  ...TELEMETRY_SCOPES,
  ...ANALYTICS_SCOPES,
  ...ORGANIZATION_SCOPES,
  ...NOTIFICATION_SCOPES,
  ...SUBSCRIPTION_SCOPES,
  ...LOG_SCOPES,
  ...WEBHOOK_SCOPES,
];

// ─── All scopes (including admin-only) ───────────────────────────────────────
const ALL_SCOPES = [...PARTNER_SCOPES, ...ADMIN_ONLY_SCOPES];

// ─── Scope metadata (for admin reference UI) ──────────────────────────────────
const SCOPE_METADATA = {
  // MRV
  'mrv:projects:read':        { group: 'MRV Engine', label: 'MRV Projects — Read',          partnerIssuable: true },
  'mrv:projects:write':       { group: 'MRV Engine', label: 'MRV Projects — Write',         partnerIssuable: true },
  'mrv:monitoring:read':      { group: 'MRV Engine', label: 'Monitoring Periods — Read',     partnerIssuable: true },
  'mrv:monitoring:write':     { group: 'MRV Engine', label: 'Monitoring Periods — Write',    partnerIssuable: true },
  'mrv:reports:read':         { group: 'MRV Engine', label: 'MRV Reports — Read (JSON)',     partnerIssuable: true },
  'mrv:reports:download':     { group: 'MRV Engine', label: 'MRV Reports — PDF Download',   partnerIssuable: true },
  'mrv:evidence:read':        { group: 'MRV Engine', label: 'Evidence & Observations — Read', partnerIssuable: true },
  'mrv:evidence:write':       { group: 'MRV Engine', label: 'Evidence & Observations — Write', partnerIssuable: true },
  'mrv:calibrations:read':    { group: 'MRV Engine', label: 'Calibrations — Read',           partnerIssuable: true },
  'mrv:calibrations:write':   { group: 'MRV Engine', label: 'Calibrations — Write',          partnerIssuable: true },
  'mrv:analytics:read':       { group: 'MRV Engine', label: 'MRV Analytics — Read',          partnerIssuable: true },
  'mrv:catalogue:read':       { group: 'MRV Engine', label: 'Methodology Catalogue — Read',  partnerIssuable: true },
  'mrv:webhooks:manage':      { group: 'MRV Engine', label: 'MRV Webhooks — Manage',         partnerIssuable: true },
  'mrv:data-quality:read':    { group: 'MRV Engine', label: 'Data Quality — Read',           partnerIssuable: true },
  'mrv:data-quality:write':   { group: 'MRV Engine', label: 'Data Quality — Write/Approve',  partnerIssuable: true },
  'mrv:vvb:read':             { group: 'MRV Engine', label: 'VVB Data Room — Read',          partnerIssuable: true },

  // Devices
  'devices:read':             { group: 'Devices',    label: 'Devices — Read',                partnerIssuable: true },
  'devices:write':            { group: 'Devices',    label: 'Devices — Write',               partnerIssuable: true },
  'devices:telemetry:read':   { group: 'Devices',    label: 'Device Telemetry — Read',       partnerIssuable: true },

  // Telemetry
  'telemetry:read':           { group: 'Telemetry',  label: 'Telemetry — Read',              partnerIssuable: true },
  'telemetry:write':          { group: 'Telemetry',  label: 'Telemetry — Write',             partnerIssuable: true },
  'telemetry:ingest':         { group: 'Telemetry',  label: 'Telemetry Ingest (IoT)',        partnerIssuable: true },

  // Analytics
  'analytics:read':           { group: 'Analytics',  label: 'Analytics — Read',              partnerIssuable: true },

  // Org
  'organizations:read':       { group: 'Organizations', label: 'Organization — Read',        partnerIssuable: true },

  // Notifications
  'notifications:read':       { group: 'Notifications', label: 'Notifications — Read',       partnerIssuable: true },

  // Subscriptions
  'subscriptions:read':       { group: 'Subscriptions', label: 'Subscriptions — Read',       partnerIssuable: true },

  // Logs
  'logs:read':                { group: 'Logs',        label: 'Logs — Read',                  partnerIssuable: true },

  // Webhooks
  'webhooks:manage':          { group: 'Webhooks',    label: 'Webhooks — Manage',            partnerIssuable: true },

  // Admin-only
  'admin:users:read':              { group: 'Admin', label: 'Admin: Users — Read',            partnerIssuable: false },
  'admin:users:write':             { group: 'Admin', label: 'Admin: Users — Write',           partnerIssuable: false },
  'admin:organizations:read':      { group: 'Admin', label: 'Admin: Organizations — Read',   partnerIssuable: false },
  'admin:organizations:write':     { group: 'Admin', label: 'Admin: Organizations — Write',  partnerIssuable: false },
  'admin:api-keys:manage':         { group: 'Admin', label: 'Admin: API Keys — Manage',      partnerIssuable: false },
  'admin:subscriptions:manage':    { group: 'Admin', label: 'Admin: Subscriptions — Manage', partnerIssuable: false },
  'admin:system:config':           { group: 'Admin', label: 'Admin: System Config',          partnerIssuable: false },
  'admin:audit-logs:read':         { group: 'Admin', label: 'Admin: Audit Logs — Read',      partnerIssuable: false },
  'admin:analytics:read':          { group: 'Admin', label: 'Admin: Platform Analytics',     partnerIssuable: false },
  'billing:read':                  { group: 'Admin', label: 'Billing — Read',                partnerIssuable: false },
  'billing:write':                 { group: 'Admin', label: 'Billing — Write',               partnerIssuable: false },
};

// ─── Default scopes per partner tier ─────────────────────────────────────────
// Suggested defaults when approving a partner — admin can always customise.
const TIER_DEFAULT_SCOPES = {
  standard: [
    'mrv:projects:read',
    'mrv:monitoring:read',
    'mrv:reports:read',
    'mrv:reports:download',
    'mrv:analytics:read',
    'mrv:catalogue:read',
    'devices:read',
    'telemetry:read',
    'analytics:read',
    'organizations:read',
  ],
  premium: [
    'mrv:projects:read',
    'mrv:projects:write',
    'mrv:monitoring:read',
    'mrv:monitoring:write',
    'mrv:reports:read',
    'mrv:reports:download',
    'mrv:evidence:read',
    'mrv:evidence:write',
    'mrv:calibrations:read',
    'mrv:analytics:read',
    'mrv:catalogue:read',
    'mrv:webhooks:manage',
    'mrv:data-quality:read',
    'devices:read',
    'devices:write',
    'telemetry:read',
    'telemetry:write',
    'analytics:read',
    'organizations:read',
    'notifications:read',
    'webhooks:manage',
  ],
  enterprise: [
    // Everything except admin-only and billing
    ...PARTNER_SCOPES,
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Check if a scope string is valid and partner-issuable.
 * @param {string} scope
 * @returns {boolean}
 */
function isPartnerScope(scope) {
  return PARTNER_SCOPES.includes(scope);
}

/**
 * Check if a scope is admin-only (never issue to partners).
 * @param {string} scope
 * @returns {boolean}
 */
function isAdminScope(scope) {
  return ADMIN_ONLY_SCOPES.includes(scope);
}

/**
 * Validate an array of requested scopes.
 * Returns { valid: true } or { valid: false, invalid: [...], adminOnly: [...] }
 * @param {string[]} scopes
 * @returns {{ valid: boolean, invalid?: string[], adminOnly?: string[] }}
 */
function validateScopes(scopes = []) {
  const invalid   = scopes.filter(s => !ALL_SCOPES.includes(s));
  const adminOnly = scopes.filter(s => ADMIN_ONLY_SCOPES.includes(s));

  if (invalid.length || adminOnly.length) {
    return { valid: false, invalid, adminOnly };
  }
  return { valid: true };
}

/**
 * Get default scopes for a partner tier.
 * @param {'standard'|'premium'|'enterprise'} tier
 * @returns {string[]}
 */
function getDefaultScopesForTier(tier) {
  return TIER_DEFAULT_SCOPES[tier] || TIER_DEFAULT_SCOPES.standard;
}

/**
 * Get all scope metadata grouped by resource group.
 * Used by GET /api/admin/api-keys/scopes
 * @returns {Object}
 */
function getScopesByGroup() {
  const groups = {};
  for (const [scope, meta] of Object.entries(SCOPE_METADATA)) {
    if (!groups[meta.group]) groups[meta.group] = [];
    groups[meta.group].push({ scope, label: meta.label, partnerIssuable: meta.partnerIssuable });
  }
  return groups;
}

module.exports = {
  // Arrays
  ALL_SCOPES,
  PARTNER_SCOPES,
  ADMIN_ONLY_SCOPES,
  MRV_SCOPES,
  DEVICE_SCOPES,
  TELEMETRY_SCOPES,
  ANALYTICS_SCOPES,
  TIER_DEFAULT_SCOPES,

  // Helpers
  isPartnerScope,
  isAdminScope,
  validateScopes,
  getDefaultScopesForTier,
  getScopesByGroup,
};
