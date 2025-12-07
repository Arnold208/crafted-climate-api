const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const PlanSchema = new mongoose.Schema({

  planId: {
    type: String,
    default: uuidv4,
    unique: true
  },

  name: {
    type: String,
    required: true,
    unique: true,
    lowercase: true    // "freemium", "premium", "enterprise"
  },

  description: { type: String },

  priceMonthly: { type: Number, default: 0 },
  priceYearly: { type: Number, default: 0 },

  maxDevices: { type: Number, required: true },
  maxDataRetentionDays: { type: Number, required: true },
  maxDataExportMonths: { type: Number, default: 0 },

  /**
   * ============================
   * CORE SUBSCRIPTION FEATURES
   * ============================
   */
  features: {
    // Sensor data access permissions
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
     * ---------------------------
     * CORE CAPABILITIES CHECKED
     * BY MIDDLEWARE
     * ---------------------------
     */
    device_read: { type: Boolean, default: true },
    device_update: { type: Boolean, default: false },
    collaboration: { type: Boolean, default: false },
    location_access: { type: Boolean, default: false },
    public_listing: { type: Boolean, default: false },
    export: { type: Boolean, default: false }
  },

  /**
   * ============================
   * ENTERPRISE FEATURES
   * (Only visible on enterprise plans)
   * ============================
   */
  enterprise: {
    enableSLAs: { type: Boolean, default: false },
    dedicatedAccountManager: { type: Boolean, default: false },
    customDeployments: { type: Boolean, default: false }
  },

  /**
   * ============================
   * USAGE QUOTAS
   * ============================
   */
  quotas: {
    monthlyExports: { type: Number, default: 0 },
    monthlyApiCalls: { type: Number, default: 1000 }
  },

  isActive: { type: Boolean, default: true }

}, { timestamps: true });

module.exports = mongoose.model("Plan", PlanSchema);
