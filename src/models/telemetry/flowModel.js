const mongoose = require('mongoose');

const flowTelemetrySchema = new mongoose.Schema({
  auid: { type: String, required: true },
  devid: { type: String, required: true },

  // Timestamps
  transport_time: { type: Date, required: true },
  telem_time: { type: Date },

  // Shared Sensor Payload Fields
  pump: { type: Boolean, default: false },
  manual: { type: Boolean, default: false },

  // Tank Status
  tank_full: { type: Boolean, default: false },
  tank_empty: { type: Boolean, default: false },
  tank_mm: { type: Number, default: 0 },
  tank_l: { type: Number, default: 0 },

  // Health / Error
  health: { type: String, default: '0000' },

  // Battery Metrics
  bat_v: { type: Number, default: 0 },
  bat_ma: { type: Number, default: 0 },
  bat_mw: { type: Number, default: 0 },

  // Metdata / Tower Info
  next_cycle: { type: Date },
  towerInfo: {
    type: Object,
    default: {}
  }

}, { timestamps: true });

flowTelemetrySchema.index({ auid: 1, transport_time: -1 });
flowTelemetrySchema.index({ devid: 1, transport_time: -1 });

module.exports = mongoose.model('FlowTelemetry', flowTelemetrySchema);
