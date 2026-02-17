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
    v: 'voltage',
    c: 'current',
  },
  aqua: {
    i: 'devid',
    ts: 'date',
    v: 'voltage',
    c: 'current',
    temp: 'temperature_water',
    ph: 'ph',
    do: 'do',
    ec: 'ec',
    h: 'humidity',
    p: 'pressure',
    l: 'lux',
    t: 'temperature_ambient',
    err: 'error',
  },
  'gas-solo': {
    i: 'devid',
    ts: 'date',
    v: 'voltage',
    c: 'current',
    t: 'temperature',
    h: 'humidity',
    p: 'pressure',
    co2: 'eco2_ppm',
    voc: 'tvoc_ppb',
    e: 'error',
    b: 'battery',
  },
  flow: {
    i: 'devid',
    ts: 'date',
    v: 'bat_v',
    c: 'bat_ma',
    mode: 'mode',
    pump: 'pump',
    hc: 'hcode',
    tf: 'tank_full',
    te: 'tank_empty',
    tmm: 'tank_mm',
    tl: 'tank_l',
    fl: 'flow_lpm',
    fhz: 'flow_hz',
    sv: 'solar_v',
    sma: 'solar_ma',
    smw: 'solar_mw',
    pm: 'pump_ma',
    pw: 'pump_mw',
    nc: 'next_cycle',
    rssi: 'wifi_rssi',
    err: 'error',
    // Descriptive Keys
    tank_mm: 'tank_mm',
    tank_l: 'tank_l',
    tank_full: 'tank_full',
    tank_empty: 'tank_empty',
    pump: 'pump',
    manual: 'manual',
    bat_v: 'bat_v',
    bat_ma: 'bat_ma',
    bat_mw: 'bat_mw',
    health: 'health',
    timestamp: 'date',
  },
};

// System-level fields that should always be included even if not in datapoints[]
const systemFields = ['date', 'error', 'battery', 'aqi'];

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
