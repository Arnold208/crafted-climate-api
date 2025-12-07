const mongoose = require('mongoose');

const deploymentSchema = new mongoose.Schema({
  deploymentid: {
    type: String,
    required: true,
    unique: true
  },

  // org that owns this deployment
  orgid: {
    type: String,
    required: true,
    index: true
  },

  // user who created it
  createdBy: {
    type: String,  // userid
    required: true
  },

  name: {
    type: String,
    required: true
  },

  description: {
    type: String
  },

  // list of device AUIDs in this deployment
  devices: {
    type: [String],
    default: []
  },

  // org-level collaborators on the deployment itself
  collaborators: [
    {
      userid: {
        type: String,
        required: true
      },
      role: {
        type: String,
        enum: ['admin', 'editor', 'viewer'],
        default: 'viewer'
      },
      permissions: {
        type: [String],
        default: []  // e.g. ['manage_devices', 'view_telemetry']
      },
      addedAt: {
        type: Date,
        default: Date.now
      }
    }
  ]

}, { timestamps: true });

const Deployment = mongoose.model('Deployment', deploymentSchema);
module.exports = Deployment;
