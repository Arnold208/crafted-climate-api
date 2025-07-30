const registerNewDevice = require("../../../model/devices/registerDevice");
const deviceTelemetry = require("../../../model/telemetry/envModel");
const { batteryPercentage } = require("../../../utils/batteryPercentage");
const { calculateAQI } = require("../../../utils/aqiFunction");
const { cacheTelemetryToRedis } = require('../../../utils/redisTelemetry');
const { publishToSensor } = require("../../../config/socket/socketio");

// const connectDB = require('../../../config/database/mongodb'); // adjust path
// connectDB();
async function handleEnvQueuedTelemetry(messageObj) {
  const body = messageObj.body;
  const devid = body?.devid;

  if (!devid) {
    console.warn("⚠️ No 'devid' in payload.");
    return;
  }

  try {
    const foundDevice = await registerNewDevice.findOne({ devid }).select("-_id");
    if (!foundDevice) {
      console.warn(`❌ Device not registered: ${devid}`);
      return;
    }

    const auid = foundDevice.auid;
    

    const pm2_5 = parseFloat(body.pm2_5);
    const voltage = parseFloat(body.voltage);

    const formattedData = {
      transport_time : isNaN(messageObj.when) ? 0 : +messageObj.when,
      telem_time : isNaN(body.timestamp) ? 0 : +body.timestamp,
      temperature: isNaN(body.temp) ? 0 : +body.temp,
      humidity: isNaN(body.humidity) ? 0 : +body.humidity,
      pressure: isNaN(body.pressure) ? 0 : +body.pressure,
      sound: isNaN(body.sound) ? 0 : +body.sound,
      current: isNaN(body.current) ? 0 : +body.current,
      auid,
      pm1: isNaN(body.pm1) ? 0 : +body.pm1,
      pm2_5: isNaN(pm2_5) ? 0 : pm2_5,
      pm10: isNaN(body.pm10) ? 0 : +body.pm10,
      pm1s: isNaN(body.pm1s) ? 0 : +body.pm1s,
      pm2_5s: isNaN(body.pm2_5s) ? 0 : +body.pm2_5s,
      pm10s: isNaN(body.pm10s) ? 0 : +body.pm10s,
      lux: isNaN(body.lux) ? 0 : +body.lux,
      battery: isNaN(voltage) ? 0 : batteryPercentage(voltage),
      uv: isNaN(body.uv) ? 0 : +body.uv,
      aqi: isNaN(pm2_5) ? 0 : calculateAQI(pm2_5),
      error: body.err || "0000"
    };

    // Optional tower metadata
    const towerFields = [
      "tower_when", "tower_lat", "tower_lon", "tower_country",
      "tower_location", "tower_timezone", "tower_id"
    ];

    const towerInfo = {};
    for (const field of towerFields) {
      if (messageObj[field] !== undefined) {
        towerInfo[field] = messageObj[field];
      }
    }

    if (Object.keys(towerInfo).length > 0) {
      formattedData.towerInfo = towerInfo;
    }

    console.log(formattedData);

    // // Real-time push
    publishToSensor(auid, formattedData);

    await cacheTelemetryToRedis(auid, formattedData, foundDevice);


  } catch (err) {
    console.error("❌ handleEnvQueuedTelemetry Error:", err.message);
  }
}

module.exports = { handleEnvQueuedTelemetry };
