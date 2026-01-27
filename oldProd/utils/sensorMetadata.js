module.exports = {
  ENV: {
    temperature: { min: -40, max: 85 },
    humidity:    { min: 0, max: 100 },

    pm1:         { min: 0, max: 2000 },
    pm2_5:       { min: 0, max: 2000 },
    pm10:        { min: 0, max: 2000 },

    pressure:    { min: 300, max: 1200 },
    altitude:    { min: -500, max: 9000 },   // some ENV devices report altitude

    lux:         { min: 0, max: 120000 },
    uv:          { min: 0, max: 15 },

    sound:       { min: 20, max: 120 },

    aqi:         { min: 0, max: 500 },       // some ENV models include AQI
    battery:     { min: 0, max: 100 },       // system datapoint
  },

  AQUA: {
    ph:          { min: 0, max: 14 },
    ec:          { min: 0, max: 50000 },
    turbidity:   { min: 0, max: 3000 },
    waterTemp:   { min: -10, max: 70 }
  },

  GAS: {
    eco2_ppm:    { min: 400, max: 50000 },   // realistic eCO2 range
    tvoc_ppb:    { min: 0, max: 60000 },

    temperature: { min: -40, max: 85 },
    humidity:    { min: 0, max: 100 },
    pressure:    { min: 300, max: 1200 },

    aqi:         { min: 0, max: 500 },

    current:     { min: 0, max: 5 },         // INA219 style
    voltage:     { min: 0, max: 5 },
  },

  TERRA: {
    moisture:  { min: 0, max: 100 },
    npk_n:     { min: 0, max: 2000 },
    npk_p:     { min: 0, max: 2000 },
    npk_k:     { min: 0, max: 2000 },
    soilTemp:  { min: -20, max: 80 }
  }
};
