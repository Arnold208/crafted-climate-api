const { flushTelemetryToMongo } = require('../flushTelemetryToMongo');

const EnvTelemetry = require('../../models/telemetry/envModel');

flushTelemetryToMongo("GH-P8W5YXFEHGP0B1KI4W4I2", EnvTelemetry)
  .then(console.log)
  .catch(console.error);