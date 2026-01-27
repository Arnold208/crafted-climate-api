// model/subscriptions/FeatureAuditLog.js

const mongoose = require("mongoose");

const FeatureAuditLogSchema = new mongoose.Schema(
  {
    userid: {
      type: String,
      required: true,
      index: true,
    },

    feature: {
      type: String,
      required: true,
    },

    actionAttempted: {
      type: String,
      required: true,
    },

    allowed: {
      type: Boolean,
      default: false,
    },

    reason: {
      type: String,
      default: "",
    },

    metadata: {
      type: Object,
      default: {},
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("FeatureAuditLog", FeatureAuditLogSchema);
