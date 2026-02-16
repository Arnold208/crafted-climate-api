const mongoose = require('mongoose');

const flowTelemetrySchema = new mongoose.Schema({
  fid: {                // Flow device ID
    type: String,
    required: true,
  },

  // Timestamps
  transport_time: {     // Server receive time
    type: Date,
    required: true,
  },
  telem_time: {         // Device timestamp
    type: Date,
    required: false,
  },

  // Core System State
  mode: { type: String, default: "AUTO" },     // AUTO | MANUAL | SAFE
  pump: { type: Boolean, default: false },     // true = ON
  hcode: { type: String, default: "0000" },    // Health code string

  // Tank Status
  tank_full: { type: Boolean, default: false },
  tank_empty: { type: Boolean, default: false },

  tank_mm: { type: Number, default: 0 },       // Ultrasonic mm
  tank_l: { type: Number, default: 0 },        // Liters

  // Flow Sensor
  flow_lpm: { type: Number, default: 0 },      // Liters per minute
  flow_hz: { type: Number, default: 0 },       // Raw pulse frequency

  // Battery Metrics
  bat_v: { type: Number, default: 0 },         // Voltage
  bat_ma: { type: Number, default: 0 },        // Current (mA)

  // Solar Metrics (if enabled)
  solar_v: { type: Number, default: 0 },
  solar_ma: { type: Number, default: 0 },
  solar_mw: { type: Number, default: 0 },

  // Pump Electrical Load (optional)
  pump_ma: { type: Number, default: 0 },
  pump_mw: { type: Number, default: 0 },

  // Schedule
  next_cycle: { type: Date },                  // Next scheduled irrigation time

  // Connectivity (optional but useful)
  wifi_rssi: { type: Number, default: 0 },
  cell_rssi: { type: Number, default: 0 },

  // Metadata
  towerInfo: {
    type: Object,
    default: {}
  }

}, { timestamps: true });

flowTelemetrySchema.index({ fid: 1, transport_time: -1 });

module.exports = mongoose.model('FlowTelemetry', flowTelemetrySchema);
