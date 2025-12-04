// model/subscriptions/TelemetryIngestionLog.js

const mongoose = require("mongoose");

const TelemetryIngestionLogSchema = new mongoose.Schema(
  {
    devid: {
      type: String,
      required: true,
      index: true,
    },

    auid: {
      type: String,
      required: true,
      index: true,
    },

    model: {
      type: String,
      required: true,
    },

    userid: {
      type: String,
      required: true,
      index: true,
    },

    sizeBytes: {
      type: Number,
      default: 0,
    },

    metadata: {
      type: Object,
      default: {},
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("TelemetryIngestionLog", TelemetryIngestionLogSchema);
