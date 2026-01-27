const mongoose = require('mongoose');

const aquaTelemetrySchema = new mongoose.Schema({
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

  // Sensor readings (Aqua datapoints)
  ec: { type: Number, default: 0 },
  humidity: { type: Number, default: 0 },
  temperature_water: { type: Number, default: 0 },
  temperature_ambient: { type: Number, default: 0 },
  pressure: { type: Number, default: 0 },
  ph: { type: Number, default: 0 },
  lux: { type: Number, default: 0 },
  turbidity: { type: Number, default: 0 },
  voltage: { type: Number, default: 0 },
  current: { type: Number, default: 0 },

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

aquaTelemetrySchema.index({ auid: 1, transport_time: -1 });

module.exports = mongoose.model('AquaTelemetry', aquaTelemetrySchema);
