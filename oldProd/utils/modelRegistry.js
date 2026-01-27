const EnvTelemetry = require('../model/telemetry/envModel');
// const GasTelemetry = require('../model/telemetry/gasTelemetry');
// Add more models as needed...

const telemetryModels = {
  env: EnvTelemetry,
  // gas: GasTelemetry,
  // terra: TerraTelemetry,
};

module.exports = telemetryModels;
