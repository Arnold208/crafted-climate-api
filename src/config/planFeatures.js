/**
 * Plan Features Configuration
 * ===========================
 * Defines feature availability per subscription plan.
 * Used by verifyPlanFeature middleware to gate functionality.
 */

const PLAN_FEATURES = {

  // ------------------------------------
  // 1. FREE (Personal / Hobbyist)
  // ------------------------------------
  free: {
    maxDevices: 3,
    maxDataRetentionDays: 30, // 1 Month

    // Capabilities
    device_read: true,
    device_update: false,
    export: false,
    public_listing: true,

    // Professional Features
    analytics: false, // No AI
    aiInsightsLevel: 'none',

    org_management: false,
    collaboration: false, // Single User
    maxMembers: 1,

    apiAccess: 'none', // UI Only
    supportLevel: 'community',
  },

  // ------------------------------------
  // 2. PRO (Small Business / Startups)
  // ------------------------------------
  pro: {
    maxDevices: 50,
    maxDataRetentionDays: 365, // 1 Year

    // Capabilities
    device_read: true,
    device_update: true,
    export: true, // CSV Download
    public_listing: true,

    // Professional Features
    analytics: true,
    aiInsightsLevel: 'basic', // Anomaly Detection

    org_management: true,
    collaboration: true,
    maxMembers: 5,

    apiAccess: 'limited', // Rate limited API access
    supportLevel: 'email_48h',
  },

  // ------------------------------------
  // 3. ENTERPRISE (Large Scale / Industrial)
  // ------------------------------------
  enterprise: {
    maxDevices: null, // Unlimited
    maxDataRetentionDays: null, // Unlimited

    // Capabilities
    device_read: true,
    device_update: true,
    export: true,
    public_listing: true,

    // Professional Features
    analytics: true,
    aiInsightsLevel: 'advanced', // Predictive + Forecasting

    org_management: true,
    collaboration: true,
    maxMembers: null, // Unlimited

    apiAccess: 'full', // High throughput API
    supportLevel: 'dedicated_247',
  },

  // Alias for 'free' during migration
  freemium: {
    maxDevices: 3,
    maxDataRetentionDays: 30,
    device_read: true,
    device_update: false,
    export: false,
    analytics: false,
    aiInsightsLevel: 'none',
    org_management: false,
    collaboration: false,
    maxMembers: 1,
    apiAccess: 'none',
    supportLevel: 'community',
  }
};

module.exports = {
  PLAN_FEATURES
};
