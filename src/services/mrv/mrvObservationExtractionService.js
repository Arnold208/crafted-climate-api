'use strict';

const MEASUREMENT_METADATA_KEYS = new Set([
  'devid', 'devmod', 'time', 'ts', 'event', 'monitoringPeriodId',
  'batch_seq', 'reading_idx', 'err', 'err_status', 'body'
]);

function toFiniteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractObservationPayload(envelope = {}) {
  const rawEvent = envelope.body || envelope.rawEvent || {};
  const nestedBody = rawEvent.body && typeof rawEvent.body === 'object' ? rawEvent.body : null;
  const sensorReadings = nestedBody || rawEvent;
  const measurements = {};
  const derivedValues = {};

  for (const [key, value] of Object.entries(sensorReadings || {})) {
    if (MEASUREMENT_METADATA_KEYS.has(key)) continue;
    const numeric = toFiniteNumber(value);
    if (numeric !== null) measurements[key] = numeric;
  }

  if (measurements.aqi !== undefined) derivedValues.aqi = measurements.aqi;
  if (measurements.battery !== undefined) derivedValues.battery = measurements.battery;

  return {
    rawEvent,
    monitoringPeriodId: rawEvent.monitoringPeriodId || null,
    measurements,
    derivedValues
  };
}

module.exports = { extractObservationPayload };