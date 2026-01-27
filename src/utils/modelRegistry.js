const EnvTelemetry = require('../models/telemetry/envModel');
// const GasTelemetry = require('../models/telemetry/gasTelemetry');
// Add more models as needed...

const telemetryModels = {
  env: EnvTelemetry,
  // gas: GasTelemetry,
  // terra: TerraTelemetry,
};

module.exports = telemetryModels;
