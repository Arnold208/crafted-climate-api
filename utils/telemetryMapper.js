// utils/telemetryMapper.js

const modelKeyMaps = {
  env: {
    t: 'temperature',
    h: 'humidity',
    p: 'pressure',
    p1: 'pm1',
    p2: 'pm2_5',
    p10: 'pm10',
    l: 'lux',
    u: 'uv',
    s: 'sound',
    d: 'date',
    e: 'error',
    b: 'battery',
  },
  gas: {
    t: 'temperature',
    h: 'humidity',
    co2: 'co2',
    ch4: 'methane',
    no2: 'no2',
    d: 'date',
    e: 'error',
    b: 'battery',
  },
  // Add more models as needed
};

// System-level fields that should always be included even if not in datapoints[]
const systemFields = ['date', 'error', 'battery','aqi'];

function mapTelemetryData(model, body, datapoints) {
  const keyMap = modelKeyMaps[model.toLowerCase()];
  if (!keyMap) {
    throw new Error(`Model mapping not defined for: ${model}`);
  }

  const mapped = {};

  for (const [shortKey, fullKey] of Object.entries(keyMap)) {
    const value = body[shortKey];

    if (value !== undefined) {
      if (datapoints.includes(fullKey) || systemFields.includes(fullKey)) {
        mapped[fullKey] = value;
      }
    }
  }

  return mapped;
}

module.exports = { mapTelemetryData };
