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

  location: {
    type: String,
    required: true
  },

  userid: {
    type: String,
    required: true
  },

  organization: {
    type: String
  },

  deployment: {
    type: String
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
    default: 'https://craftedclimateota.blob.core.windows.net/images/upload-1733768062669-env.png?sv=2025-01-05&st=2024-12-09T18%3A14%3A26Z&se=2029-12-09T18%3A14%3A26Z&sr=b&sp=r&sig=BsvH4rZBPZWk2HkATZe9bT%2BOyXd9NsPJLXSVowwwRCs%3D'
  },

  status: {
    type: String,
    default: 'offline'
  },

  availability: {
    type: String,
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
