// model/telemetry/gasSoloModel.js
const mongoose = require('mongoose');

const gasSoloTelemetrySchema = new mongoose.Schema({
  auid: { type: String, required: true },

  // Timestamps
  transport_time: { type: Date, required: true },
  telem_time: { type: Date, required: false },

  // Sensor readings (Legacy standard)
  temperature: { type: Number, default: 0 },
  humidity: { type: Number, default: 0 },
  pressure: { type: Number, default: 0 },

  // Raw Payload Fields (Gas Solo Strict)
  comp_temp: { type: Number, default: 0 },
  comp_humi: { type: Number, default: 0 },
  eco2: { type: Number, default: 0 },
  tvoc: { type: Number, default: 0 },
  err_status: { type: String, default: "0000" },

  // Gas-specific (Legacy/Computed)
  aqi: { type: Number, default: 0 },
  current: { type: Number, default: 0 },
  eco2_ppm: { type: Number, default: 0 },
  tvoc_ppb: { type: Number, default: 0 },

  // Box/Environmental
  box_temperature: { type: Number, default: 0 },
  box_humidity: { type: Number, default: 0 },
  box_pressure: { type: Number, default: 0 },

  // Device Info / Status
  mode: { type: String, default: 'normal' },
  v_type: { type: String, default: 'real' },
  ver: { type: String, default: '' },
  devmod: { type: String, default: '' },
  boot: { type: Number, default: 0 },

  // Battery + errors
  voltage: { type: Number, default: 0 },
  battery: { type: Number, default: 0 },
  brownout: { type: Number, default: 0 },
  err_count: { type: Number, default: 0 },
  error: { type: String, default: '0000' },

  // Metadata
  towerInfo: {
    type: Object,
    default: {}
  }

}, { timestamps: true, shardKey: { auid: 1 } });

gasSoloTelemetrySchema.index({ auid: 1, transport_time: -1 });
gasSoloTelemetrySchema.index({ auid: 1, transport_time: 1 }); // Optimized for graph route

module.exports = mongoose.model('GasSoloTelemetry', gasSoloTelemetrySchema);
