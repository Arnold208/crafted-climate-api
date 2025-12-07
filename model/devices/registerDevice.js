const mongoose = require('mongoose');

const registerNewDeviceSchema = new mongoose.Schema({
  auid: {
    type: String,
    unique: true,
    required: true
  },

  serial: {
    type: String,
    unique: true,
    required: true
  },

  devid: {
    type: String,
    unique: true,
    required: true
  },

  mac: {
    type: String,
    unique: true,
    required: true
  },

  model: {
    type: String,
    required: true
  },

  type: {
    type: String,
    required: true
  },

  // 🧑 Owner (user)
  userid: {
    type: String,
    required: true
  },

  // 🏢 Owning organization (optional; personal devices have null)
  orgid: {
    type: String,
    default: null
  },

  // 🔗 Optional deployment association
  deploymentid: {
    type: String,
    default: null
  },

  location: {
    type: String,
    required: true   // JSON string as you already had
  },

  nickname: {
    type: String,
    default: 'CrowdSense'
  },

  battery: {
    type: Number,
    default: 0
  },

  image: {
    type: String,
    default: 'https://craftedclimateota.blob.core...'
  },

  status: {
    type: String,
    default: 'offline'
  },

  availability: {
    type: String,
    enum: ['private', 'public'],
    default: 'private'
  },

  datapoints: {
    type: [String],
    default: []
  },

  subscription: {
    type: [String],
    default: []
  },

  manufacturingId: {
    type: String,
    required: true
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  collaborators: {
    type: [
      {
        userid: {
          type: String,
          required: true
        },
        role: {
          type: String,
          enum: ['viewer', 'editor', 'admin'],
          default: 'viewer'
        },
        permissions: {
          type: [String],
          enum: ['update', 'delete', 'export', 'share'],
          default: []
        },
        addedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    default: []
  },

  noteDevUuid: {
    type: String
  }

}, { versionKey: false });

const registerNewDevice = mongoose.model('registerDevices', registerNewDeviceSchema, 'registeredDevices');
module.exports = registerNewDevice;
