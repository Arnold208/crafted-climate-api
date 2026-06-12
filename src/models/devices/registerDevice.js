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
    default: null
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

  /**
   * OPERATIONAL STATE — intentional power/lifecycle state set by owner/operator.
   * Distinct from `status` (online/offline connectivity):
   *   - active   : Device is deployed and expected to report data.
   *   - inactive : Deliberately turned off by an owner/admin. Offline alerts suppressed.
   *   - disabled : Auto-set after 30+ days inactive. Alerts and heartbeat processing halted.
   */
  state: {
    type: String,
    enum: ['active', 'inactive', 'disabled'],
    default: 'active'
  },
  stateChangedAt: { type: Date, default: null },
  stateChangedBy: { type: String, default: null }, // userid that last changed state

  datapoints: { type: [String], default: [] },
  subscription: { type: [String], default: [] },

  manufacturingId: { type: String, required: true },
  frequency: { type: Number, default: 30 },
  batch: { type: Number, default: 2 },
  createdAt: { type: Date, default: Date.now },

  collaborators: [
    new mongoose.Schema(
      {
        userid: { type: String, required: true },

        role: {
          type: String,
          enum: ["device-admin", "device-support", "device-user", "viewer", "editor", "admin", "support", "user"],
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

  noteDevUuid: { type: String },
  isEnvInitialized: { type: Boolean, default: false },
  acquisitionType: {
    type: String,
    enum: ['purchase', 'maas'],
    default: 'purchase',
    index: true
  },
  netMode: {
    type: String,
    enum: ['cellular', 'wifi'],
    default: 'cellular'
  },

  /** 
   * Platform Hardening: Device Metadata & Safety
   */
  hardwareVersion: { type: String, default: null },
  firmwareVersion: { type: String, default: null },
  capabilities: { type: [String], default: [] },

  /**
   * Status & Alerting
   */
  notificationPreferences: {
    enabled: { type: Boolean, default: true },
    offlineAlert: { type: Boolean, default: true },
    alertThresholdMinutes: { type: Number, default: 30 },
    recipients: [{ type: String }] // emails
  },

  /**
   * Flow Sensor Specific - Power & Setup
   */
  power_system: {
    architecture: {
      type: String,
      enum: ['SOLAR', 'AC', 'HYBRID'],
      default: 'SOLAR'
    },
    capabilities: {
      solar: { type: Boolean, default: true },
      battery: { type: Boolean, default: true },
      ac_input: { type: Boolean, default: false }
    }
  },

  setup: {
    requires_configuration: { type: Boolean, default: true },
    is_configured: { type: Boolean, default: false },

    wifi_configured: { type: Boolean, default: false },
    api_key_generated: { type: Boolean, default: false },

    tank_calibrated: { type: Boolean, default: false },

    tank_height_mm: { type: Number, default: null },
    tank_volume_l: { type: Number, default: null },

    setup_completed_at: { type: Date, default: null },
    last_calibration_update: { type: Date, default: null }
  },

  deletedAt: { type: Date, default: null, index: true }
}, { versionKey: false });

// Indexes for performance
registerNewDeviceSchema.index({ "collaborators.userid": 1 });
registerNewDeviceSchema.index({ organizationId: 1 });
registerNewDeviceSchema.index({ userid: 1 });
registerNewDeviceSchema.index({ status: 1 });
registerNewDeviceSchema.index({ state: 1 }); // For auto-disable cron query
registerNewDeviceSchema.index({ state: 1, stateChangedAt: 1 }); // Compound for efficient auto-disable scan


module.exports = mongoose.model(
  'registerDevices',
  registerNewDeviceSchema,
  'registeredDevices'
);
