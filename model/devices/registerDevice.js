const mongoose = require('mongoose');

const registerNewDeviceSchema = new mongoose.Schema({

  auid: { type: String, unique: true, required: true },
  serial: { type: String, unique: true, required: true },
  devid: { type: String, unique: true, required: true },
  mac: { type: String, unique: true, required: true },

  model: { type: String, required: true },
  type: { type: String, required: true },

  location: { type: String, required: true },

  /**
   * OLD FIELD — must stay for backward compatibility.
   * Represents the device owner in the old system.
   */
  userid: { type: String, required: true },

  /**
   * NEW FIELD — future device owner field.
   * During transition, populate both userid + ownerUserId.
   */
  ownerUserId: {
    type: String,
    default: null
  },

  /**
   * OLD FIELD — single organization, old system
   */
  organization: {
    type: String,
    default: null
  },

  /**
   * NEW MULTITENANCY FIELD (will replace organization)
   */
  organizationId: {
    type: String,
    default: null,
    index: true
  },

  /**
   * OLD FIELD — stores deployment string
   * Keep it alive until migration
   */
  deployment: {
    type: String,
    default: null
  },

  /**
   * NEW FIELD — canonical deployment reference going forward
   */
  deploymentId: {
    type: String,
    default: null
  },

  nickname: { type: String, default: 'CrowdSense' },
  battery: { type: Number, default: 0 },
  image: { type: String },

  status: { type: String, default: 'offline' },
  availability: { type: String, default: 'private' },

  datapoints: { type: [String], default: [] },
  subscription: { type: [String], default: [] },

  manufacturingId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },

  collaborators: [
    new mongoose.Schema(
      {
        userid: { type: String, required: true },

        role: {
          type: String,
          enum: ["device-admin", "device-support", "device-user"],
          default: "device-user"
        },

        permissions: {
          type: [String],
          default: []
        },

        addedAt: { type: Date, default: Date.now }
      },
      { _id: false } // Disable _id for subdocuments
    )
  ],

  noteDevUuid: { type: String }

}, { versionKey: false });

module.exports = mongoose.model(
  'registerDevices',
  registerNewDeviceSchema,
  'registeredDevices'
);
