const mongoose = require("mongoose");

const UsageLogSchema = new mongoose.Schema({
  // who triggered the action
  userid: {
    type: String,
    required: true
  },

  // optional: which org context was active
  orgid: {
    type: String,
    default: null
  },

  type: {
    type: String,
    required: true
    // e.g. "monthlyExports", "apiCall", "deviceRegistered"
  },

  meta: {
    type: Object,
    default: {}
  }

}, { timestamps: true });

module.exports = mongoose.model("UsageLog", UsageLogSchema);
