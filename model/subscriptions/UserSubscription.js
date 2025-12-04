const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const UserSubscriptionSchema = new mongoose.Schema({

  subscriptionId: {
    type: String,
    default: uuidv4,
    unique: true
  },

  userid: {
    type: String,  // matches your User.userid (string)
    required: true,
    unique: true
  },

  // reference by UUID string, not ObjectId
  planId: {
    type: String,
    required: true
  },

  status: {
    type: String,
    enum: ["active", "inactive", "expired", "cancelled"],
    default: "active"
  },

  billingCycle: {
    type: String,
    enum: ["free", "monthly", "yearly"],
    default: "free"
  },

  startDate: { type: Date, default: Date.now },
  endDate: { type: Date },

  autoRenew: { type: Boolean, default: false },

  usage: {
    devicesCount: { type: Number, default: 0 },
    exportsThisMonth: { type: Number, default: 0 },
    apiCallsThisMonth: { type: Number, default: 0 }
  }

}, { timestamps: true });

module.exports = mongoose.model("UserSubscription", UserSubscriptionSchema);
