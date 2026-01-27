const mongoose = require('mongoose');

const envTelemetrySchema = new mongoose.Schema({
  auid: {
    type: String,
    required: true,
  },

  // Timestamps
  transport_time: {
    type: Date,
    required: true,
  },
  telem_time: {
    type: Date,
    required: false,
  },

  // Sensor readings
  temperature: { type: Number, default: 0 },
  humidity: { type: Number, default: 0 },
  pressure: { type: Number, default: 0 },
  altitude: { type: Number, default: 0 },

  // Particulate Matter
  pm1: { type: Number, default: 0 },
  pm2_5: { type: Number, default: 0 },
  pm10: { type: Number, default: 0 },
  pm1s: { type: Number, default: 0 },
  pm2_5s: { type: Number, default: 0 },
  pm10s: { type: Number, default: 0 },

  // Light and sound
  lux: { type: Number, default: 0 },
  uv: { type: Number, default: 0 },
  sound: { type: Number, default: 0 },

  // Derived metrics
  aqi: { type: Number, default: 0 },
  battery: { type: Number, default: 0 },
  error: { type: String, default: '0000' },

  // Metadata
  towerInfo: {
    type: Object,
    default: {}
  }

}, { timestamps: true });

envTelemetrySchema.index({ auid: 1, transport_time: -1 });

module.exports = mongoose.model('EnvTelemetry', envTelemetrySchema);
