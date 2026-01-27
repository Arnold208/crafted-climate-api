// model/subscriptions/UsageLog.js

const mongoose = require("mongoose");

const UsageLogSchema = new mongoose.Schema(
  {
    userid: {
      type: String,
      required: true,
      index: true,
    },

    type: {
      type: String,
      required: true,
      enum: [
        "monthlyExports",
        "ingestion",
        "apiRequest",
        "publicAccess",
        "collaborationOp",
        "deviceUpdate",
        "other"
      ],
    },

    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("UsageLog", UsageLogSchema);
