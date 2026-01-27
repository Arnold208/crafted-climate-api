// model/telemetry/gasSoloModel.js
const mongoose = require('mongoose');

const gasSoloTelemetrySchema = new mongoose.Schema({
  auid: { type: String, required: true },

  // Timestamps
  transport_time: { type: Date, required: true },
  telem_time: { type: Date, required: false },

  // Sensor readings
  temperature: { type: Number, default: 0 },
  humidity: { type: Number, default: 0 },
  pressure: { type: Number, default: 0 },

  // Gas-specific
  aqi: { type: Number, default: 0 },
  current: { type: Number, default: 0 },
  eco2_ppm: { type: Number, default: 0 },
  tvoc_ppb: { type: Number, default: 0 },

  // Battery + errors
  voltage: { type: Number, default: 0 },
  battery: { type: Number, default: 0 },
  error: { type: String, default: '0000' },

  // Metadata
  towerInfo: {
    type: Object,
    default: {}
  }

}, { timestamps: true });

gasSoloTelemetrySchema.index({ auid: 1, transport_time: -1 });

module.exports = mongoose.model('GasSoloTelemetry', gasSoloTelemetrySchema);
