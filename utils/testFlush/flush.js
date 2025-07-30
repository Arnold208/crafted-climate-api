const { flushTelemetryToMongo } = require('../flushTelemetryToMongo');

const EnvTelemetry = require('../../model/telemetry/envModel');

flushTelemetryToMongo("GH-5ATFWL2T916TCA_CBCFU-", EnvTelemetry)
  .then(console.log)
  .catch(console.error);