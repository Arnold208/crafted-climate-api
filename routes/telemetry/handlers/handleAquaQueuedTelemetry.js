const registerNewDevice = require("../../../model/devices/registerDevice");
const deviceTelemetry = require("../../../model/telemetry/aquaModel");
const { batteryPercentage } = require("../../../utils/batteryPercentage");
const { cacheTelemetryToRedis } = require('../../../utils/redisTelemetry');
const { publishToAUID } = require("../../../config/socket/socketio");
const { checkThresholds } = require("../../../utils/thresholdEngine");

async function handleAquaQueuedTelemetry(messageObj) {
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

    // Parse common inputs
    const voltage = parseFloat(body.voltage);

    const formattedData = {
      transport_time: isNaN(messageObj.when) ? 0 : +messageObj.when,
      telem_time: isNaN(body.ts) ? messageObj.when : +body.ts,
      ec: isNaN(body.ec) ? 0 : +body.ec,
      humidity: isNaN(body.humidity) ? 0 : +body.humidity,
      temperature_water: isNaN(body.temperature_water) ? 0 : +body.temperature_water,
      temperature_ambient: isNaN(body.temperature_ambient) ? 0 : +body.temperature_ambient,
      pressure: isNaN(body.pressure) ? 0 : +body.pressure,
      ph: isNaN(body.ph) ? 0 : +body.ph,
      lux: isNaN(body.lux) ? 0 : +body.lux,
      turbidity: isNaN(body.turbidity) ? 0 : +body.turbidity,
      voltage: isNaN(voltage) ? 0 : voltage,
      current: isNaN(body.current) ? 0 : +body.current,
      battery: isNaN(voltage) ? 0 : batteryPercentage(voltage),
      error: body.err || "0000",
      auid
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

    console.log("📡 Formatted telemetry:", formattedData);

    
    // 🧠 Cache for fast reads
    await cacheTelemetryToRedis(auid, formattedData, foundDevice);

    // 🚀 Real-time broadcast
    publishToAUID(auid, formattedData);
    checkThresholds(auid, formattedData);


    // 🗄️ Optional: persist to Mongo
    // await deviceTelemetry.create(formattedData);

  } catch (err) {
    console.error("❌ handleAquaQueuedTelemetry Error:", err.message);
  }
}

module.exports = { handleAquaQueuedTelemetry };
