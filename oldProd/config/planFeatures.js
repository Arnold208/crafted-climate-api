/**
 * Plan Features Configuration
 * ===========================
 * Defines feature availability per subscription plan.
 * Used by verifyPlanFeature middleware to gate functionality.
 */

const PLAN_FEATURES = {
  
  free: {
    device_read: true,
    device_update: false,
    export: false,
    analytics: false,
    org_management: false,
    collaboration: false,
    public_listing: true,
    maxDevices: 3,
    maxDataRetentionDays: 30,
  },

  pro: {
    device_read: true,
    device_update: true,
    export: true,
    analytics: true,
    org_management: false,
    collaboration: true,
    public_listing: true,
    maxDevices: 50,
    maxDataRetentionDays: 365,
  },

  enterprise: {
    device_read: true,
    device_update: true,
    export: true,
    analytics: true,
    org_management: true,
    collaboration: true,
    public_listing: true,
    maxDevices: null, // unlimited
    maxDataRetentionDays: null, // unlimited
  },

  freemium: {
    device_read: true,
    device_update: false,
    export: false,
    analytics: false,
    org_management: false,
    collaboration: false,
    public_listing: true,
    maxDevices: 3,
    maxDataRetentionDays: 30,
  }
};

module.exports = {
  PLAN_FEATURES
};
