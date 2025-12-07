const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  orgid: {
    type: String,
    required: true,
    unique: true
  },

  name: {
    type: String,
    required: true
  },

  description: {
    type: String,
    default: ""
  },

  // user who created the org (probably a superadmin or a normal user)
  createdBy: {
    type: String,   // userid
    required: true
  },

  // org "owner" – main admin for billing + management
  ownerUserid: {
    type: String,   // userid
    required: true
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  // Link to org-level subscription (OrgSubscription.subscriptionId)
  subscriptionId: {
    type: String,
    default: null
  },

  // Global org settings
  settings: {
    timezone: { type: String, default: "UTC" },
    logo: { type: String, default: "" },
    language: { type: String, default: "en" },
    // how many devices they allow inside this org (you can use this + plan)
    maxDeployments: { type: Number, default: 50 },
    maxMembers: { type: Number, default: 50 }
  }
});

module.exports = mongoose.model("Organization", organizationSchema);
