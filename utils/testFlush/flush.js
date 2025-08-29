const { flushTelemetryToMongo } = require('../flushTelemetryToMongo');

const EnvTelemetry = require('../../model/telemetry/envModel');

flushTelemetryToMongo("GH-YJG9XN24WVQ2-SW3JXMP2", EnvTelemetry)
  .then(console.log)
  .catch(console.error);