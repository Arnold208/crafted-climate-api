const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const OrgSubscriptionSchema = new mongoose.Schema({

  subscriptionId: {
    type: String,
    default: uuidv4,
    unique: true
  },

  // Org-level subscription → always tied to an org
  orgid: {
    type: String,   // Organization.orgid
    required: true,
    unique: true
  },

  planId: {
    type: String,   // Plan.planId
    required: true
  },

  scope: {
    type: String,
    enum: ['organization'],
    default: 'organization'
  },

  status: {
    type: String,
    enum: ["active", "inactive", "expired", "cancelled"],
    default: "active"
  },

  billingCycle: {
    type: String,
    enum: ["monthly", "yearly"],
    default: "monthly"
  },

  startDate: { type: Date, default: Date.now },
  endDate: { type: Date },

  autoRenew: { type: Boolean, default: true },

  usage: {
    devicesCount: { type: Number, default: 0 },
    exportsThisMonth: { type: Number, default: 0 },
    apiCallsThisMonth: { type: Number, default: 0 }
  }

}, { timestamps: true });

module.exports = mongoose.model("OrgSubscription", OrgSubscriptionSchema);
