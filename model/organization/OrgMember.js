const mongoose = require('mongoose');

const orgMemberSchema = new mongoose.Schema({
  orgid: {
    type: String,
    required: true,
    index: true
  },

  userid: {
    type: String,
    required: true,
    index: true
  },

  role: {
    type: String,
    enum: ['owner', 'admin', 'member', 'viewer'],
    default: 'member'
  },

  permissions: {
    type: [String],
    default: []   // e.g. ['manage_devices', 'manage_deployments', 'view_billing']
  },

  joinedAt: {
    type: Date,
    default: Date.now
  },

  invitedBy: {
    type: String, // userid
    default: null
  },

  status: {
    type: String,
    enum: ['active', 'invited', 'suspended'],
    default: 'active'
  }

}, { timestamps: true });

module.exports = mongoose.model("OrgMember", orgMemberSchema);
