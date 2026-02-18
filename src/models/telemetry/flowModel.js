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
  sensor_ok: { type: Boolean, default: true },
  sleeping: { type: Boolean, default: false },
  pump_session: {
    duration_s: { type: Number },
    avg_ma: { type: Number },
    avg_mw: { type: Number },
    min_v: { type: Number },
    max_v: { type: Number },
    samples: { type: Number }
  },

  // Flattened for CSV Export / Trends
  ps_duration: { type: Number },
  ps_avg_ma: { type: Number },
  ps_avg_mw: { type: Number },
  ps_min_v: { type: Number },
  ps_max_v: { type: Number },
  ps_samples: { type: Number },

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
