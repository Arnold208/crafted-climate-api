/**
 * Plan Features Configuration
 * ===========================
 * Defines feature availability per subscription plan.
 * Used by verifyPlanFeature and checkPlanFeature middlewares to gate functionality.
 */

const PLAN_FEATURES = {

  // ------------------------------------
  // 1. FREE / FREEMIUM (Personal / Hobbyist)
  // ------------------------------------
  free: {
    maxDevices: 3,
    maxDataRetentionDays: 7,

    // Capabilities
    device_read: true,
    device_update: false,
    export: false,
    public_listing: true,

    // Professional Features
    analytics: false,
    aiInsightsLevel: 'none',

    org_management: false,
    collaboration: false, // Single User
    maxMembers: 1,

    apiAccess: 'none',
    maxApiCallsPerMonth: 0,
    websockets: false,
    webhooks: false,
    alerts: 'none',
    supportLevel: 'community',
  },

  // Alias for 'free' during migrations/fallback
  freemium: {
    maxDevices: 3,
    maxDataRetentionDays: 7,
    device_read: true,
    device_update: false,
    export: false,
    public_listing: true,
    analytics: false,
    aiInsightsLevel: 'none',
    org_management: false,
    collaboration: false,
    maxMembers: 1,
    apiAccess: 'none',
    maxApiCallsPerMonth: 0,
    websockets: false,
    webhooks: false,
    alerts: 'none',
    supportLevel: 'community',
  },

  // ------------------------------------
  // 2. STARTER (Small Teams / Early Stage)
  // ------------------------------------
  starter: {
    maxDevices: 10,
    maxDataRetentionDays: 30,

    // Capabilities
    device_read: true,
    device_update: true,
    export: true,
    public_listing: true,

    // Professional Features
    analytics: true,
    aiInsightsLevel: 'basic',

    org_management: true,
    collaboration: true,
    maxMembers: 3,

    apiAccess: 'limited',
    maxApiCallsPerMonth: 1000,
    websockets: true,
    webhooks: false,
    alerts: 'basic',
    supportLevel: 'email_48h',
  },

  // ------------------------------------
  // 3. PREMIUM (Growing Businesses)
  // ------------------------------------
  premium: {
    maxDevices: 50,
    maxDataRetentionDays: 90,

    // Capabilities
    device_read: true,
    device_update: true,
    export: true,
    public_listing: true,

    // Professional Features
    analytics: true,
    aiInsightsLevel: 'moderate',

    org_management: true,
    collaboration: true,
    maxMembers: 10,

    apiAccess: 'limited',
    maxApiCallsPerMonth: 10000,
    websockets: true,
    webhooks: false,
    alerts: 'smart',
    supportLevel: 'email_24h',
  },

  // ------------------------------------
  // 4. ENTERPRISE (Large Scale / Industrial)
  // ------------------------------------
  enterprise: {
    maxDevices: null, // Unlimited
    maxDataRetentionDays: null, // Unlimited (365+ days)

    // Capabilities
    device_read: true,
    device_update: true,
    export: true,
    public_listing: true,

    // Professional Features
    analytics: true,
    aiInsightsLevel: 'advanced',

    org_management: true,
    collaboration: true,
    maxMembers: null, // Unlimited

    apiAccess: 'full',
    maxApiCallsPerMonth: null, // Unlimited
    websockets: true,
    webhooks: true,
    alerts: 'automated',
    supportLevel: 'dedicated_247',
  },

  // ------------------------------------
  // 5. MONITORING-AS-A-SERVICE (MaaS) PLANS
  // ------------------------------------
  maas_starter: {
    maxDevices: 10,
    maxDataRetentionDays: 30,
    device_read: true,
    device_update: true,
    export: true,
    public_listing: true,
    analytics: true,
    aiInsightsLevel: 'basic',
    org_management: true,
    collaboration: true,
    maxMembers: 3,
    apiAccess: 'limited',
    maxApiCallsPerMonth: 1000,
    websockets: true,
    webhooks: false,
    alerts: 'basic',
    supportLevel: 'email_48h',
  },

  maas_premium: {
    maxDevices: 50,
    maxDataRetentionDays: 90,
    device_read: true,
    device_update: true,
    export: true,
    public_listing: true,
    analytics: true,
    aiInsightsLevel: 'moderate',
    org_management: true,
    collaboration: true,
    maxMembers: 10,
    apiAccess: 'limited',
    maxApiCallsPerMonth: 10000,
    websockets: true,
    webhooks: false,
    alerts: 'smart',
    supportLevel: 'email_24h',
  },

  maas_enterprise: {
    maxDevices: null,
    maxDataRetentionDays: null,
    device_read: true,
    device_update: true,
    export: true,
    public_listing: true,
    analytics: true,
    aiInsightsLevel: 'advanced',
    org_management: true,
    collaboration: true,
    maxMembers: null,
    apiAccess: 'full',
    maxApiCallsPerMonth: null,
    websockets: true,
    webhooks: true,
    alerts: 'automated',
    supportLevel: 'dedicated_247',
  }
};

module.exports = {
  PLAN_FEATURES
};

