// handlers/handleGasSoloQueuedTelemetry.js
const registerNewDevice = require("../../../model/devices/registerDevice");
const gasSoloTelemetry = require("../../../model/telemetry/gasSoloModel");
const { batteryPercentage } = require("../../../utils/batteryPercentage");
const { cacheTelemetryToRedis } = require("../../../utils/redisTelemetry");
const { publishToSensor } = require("../../../config/socket/socketio");

async function handleGasSoloQueuedTelemetry(messageObj) {
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
    const voltage = parseFloat(body.voltage);

    const formattedData = {
      transport_time: isNaN(messageObj.when) ? 0 : +messageObj.when,
      telem_time: isNaN(body.timestamp) ? 0 : +body.timestamp,
      auid,

      temperature: isNaN(body.temp) ? 0 : +body.temp,
      humidity: isNaN(body.humidity) ? 0 : +body.humidity,
      pressure: isNaN(body.pressure) ? 0 : +body.pressure,

      aqi: isNaN(body.aqi) ? 0 : +body.aqi,
      current: isNaN(body.current) ? 0 : +body.current,
      eco2_ppm: isNaN(body.eco2_ppm) ? 0 : +body.eco2_ppm,
      tvoc_ppb: isNaN(body.tvoc_ppb) ? 0 : +body.tvoc_ppb,

      voltage: isNaN(voltage) ? 0 : voltage,
      battery: isNaN(voltage) ? 0 : batteryPercentage(voltage),
      error: body.err || "0000",
    };

    // Tower metadata
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

    console.log("🧪 GAS-SOLO Telemetry:", formattedData);

    // Push + cache
    publishToSensor(auid, formattedData);
    await cacheTelemetryToRedis(auid, formattedData, foundDevice);

    // Optionally: Save to MongoDB
    // await gasSoloTelemetry.create(formattedData);

  } catch (err) {
    console.error("❌ handleGasSoloQueuedTelemetry Error:", err.message);
  }
}

module.exports = { handleGasSoloQueuedTelemetry };
