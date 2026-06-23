const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const PlanSchema = new mongoose.Schema({

  planId: {
    type: String,
    default: uuidv4,
    unique: true
  },

  name: { type: String, required: true, unique: true },
  description: { type: String },

  priceMonthly: { type: Number, default: 0 },
  priceYearly: { type: Number, default: 0 },

  maxDevices: { type: Number, required: true },
  maxDataRetentionDays: { type: Number, required: true },
  maxDataExportMonths: { type: Number, default: 0 },

  features: {
    fullSensorAccess: { type: Boolean, default: false },

    aiInsightsLevel: {
      type: String,
      enum: ["none", "basic", "moderate", "advanced"],
      default: "none"
    },

    apiAccess: {
      type: String,
      enum: ["none", "limited", "full"],
      default: "none"
    },

    alerts: {
      type: String,
      enum: ["none", "basic", "smart", "automated"],
      default: "none"
    },

    firmwareUpdates: { type: Boolean, default: false },
    customerSupportLevel: {
      type: String,
      enum: ["none", "48h", "24/7"],
      default: "none"
    },

    /**
     * SUBSCRIPTION CAPABILITIES
     */
    device_read:     { type: Boolean, default: true },   // Freemium allowed
    device_update:   { type: Boolean, default: false },
    collaboration:   { type: Boolean, default: false },
    location_access: { type: Boolean, default: false },
    public_listing:  { type: Boolean, default: true },
    export:          { type: Boolean, default: false },
    analytics:       { type: Boolean, default: false },
    org_management:  { type: Boolean, default: false },
    mrvEngine:       { type: Boolean, default: false },

    /**
     * API & INTEGRATION CAPABILITIES
     * These were previously only in planFeatures.js config — now DB-driven.
     * null = unlimited for numeric fields.
     */
    websockets:          { type: Boolean, default: false },
    webhooks:            { type: Boolean, default: false },
    maxApiCallsPerMonth: { type: Number, default: 0 },   // 0 = blocked, null = unlimited
    maxApiKeys:          { type: Number, default: 0 },   // 0 = no API keys, null = unlimited
    maxMembers:          { type: Number, default: 1 }    // null = unlimited
  },


  enterprise: {
    enableSLAs: { type: Boolean, default: false },
    dedicatedAccountManager: { type: Boolean, default: false },
    customDeployments: { type: Boolean, default: false },

    // Device-based tier pricing for Enterprise plans
    enableTierPricing: { type: Boolean, default: false },
    tiers: {
      tier1: {
        minDevices: { type: Number, default: 0 },
        maxDevices: { type: Number, default: 50 },
        discountPercentage: { type: Number, default: 0 }
      },
      tier2: {
        minDevices: { type: Number, default: 51 },
        maxDevices: { type: Number, default: 100 },
        discountPercentage: { type: Number, default: 5 }
      },
      tier3: {
        minDevices: { type: Number, default: 101 },
        maxDevices: { type: Number, default: 500 },
        discountPercentage: { type: Number, default: 10 }
      },
      tier4: {
        minDevices: { type: Number, default: 501 },
        maxDevices: { type: Number, default: 999999 },
        discountPercentage: { type: Number, default: 15 }
      }
    }
  },

  isActive: { type: Boolean, default: true }

}, { timestamps: true });

module.exports = mongoose.model("Plan", PlanSchema);
