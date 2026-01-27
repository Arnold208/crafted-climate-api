// model/subscriptions/UserSubscription.js
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

/**
 * UserSubscription Schema
 * -------------------------
 * A user may have:
 *  - 1 personal subscription (scope: personal)
 *  - many organization subscriptions (scope: organization)
 *
 * DO NOT disable _id — top-level documents MUST have _id.
 */

const UserSubscriptionSchema = new mongoose.Schema(
  {
    /** PRIMARY KEY */
    subscriptionId: {
      type: String,
      default: uuidv4,
      // NOTE: Removed unique: true to prevent duplicate key errors during org creation
      // Use business logic validation instead (check if subscriptionId exists before create)
    },

    /** USER UUID (NOT UNIQUE — user can have MANY subscriptions) */
    userid: {
      type: String,
      required: true,
    },

    /** ORG UUID (null for personal subscriptions) */
    organizationId: {
      type: String,
      default: null,
    },

    /** Subscription Scope */
    subscriptionScope: {
      type: String,
      enum: ["personal", "organization"],
      default: "personal",
    },

    /** PLAN UUID */
    planId: {
      type: String,
      required: true,
    },

    /** Subscription State */
    status: {
      type: String,
      enum: ["active", "inactive", "expired", "cancelled", "grace_period"],
      default: "active",
    },

    /** Billing Cycle */
    billingCycle: {
      type: String,
      enum: ["free", "monthly", "yearly"],
      default: "free",
    },

    /** Dates */
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },

    /** Grace Period Management */
    gracePeriodStartDate: { type: Date, default: null },
    gracePeriodEndDate: { type: Date, default: null },
    lastReminderSentAt: { type: Date, default: null },
    reminderCount: { type: Number, default: 0 },
    previousPlanId: { type: String, default: null }, // For tracking before downgrade

    /** Auto-Renewal */
    autoRenew: { type: Boolean, default: false },

    /** Usage Metrics */
    usage: {
      devicesCount: { type: Number, default: 0 },
      exportsThisMonth: { type: Number, default: 0 },
      apiCallsThisMonth: { type: Number, default: 0 },
    },
  },

  { timestamps: true } // KEEP _id ENABLED
);

/** Indexes for performance */
UserSubscriptionSchema.index({ userid: 1 });
UserSubscriptionSchema.index({ organizationId: 1 });
UserSubscriptionSchema.index({ subscriptionScope: 1 });
UserSubscriptionSchema.index({ status: 1, endDate: 1 }); // For expiry checks
UserSubscriptionSchema.index({ status: 1, gracePeriodEndDate: 1 }); // For grace period checks

module.exports = mongoose.model("UserSubscription", UserSubscriptionSchema);
