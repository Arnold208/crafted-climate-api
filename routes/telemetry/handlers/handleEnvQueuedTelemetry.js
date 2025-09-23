const registerNewDevice = require("../../../model/devices/registerDevice");
const deviceTelemetry = require("../../../model/telemetry/envModel");
const { batteryPercentage } = require("../../../utils/batteryPercentage");
const { calculateAQI } = require("../../../utils/aqiFunction");
const { cacheTelemetryToRedis } = require('../../../utils/redisTelemetry');
const { publishToSensor } = require("../../../config/socket/socketio");

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

    // Parse numbers safely (works for v1 and v2)
    const getNum = (val, def = 0) => {
      const n = parseFloat(val);
      return isNaN(n) ? def : n;
    };

    const pm2_5 = getNum(body.pm2_5);
    const voltage = getNum(body.voltage);

    const formattedData = {
      transport_time : isNaN(messageObj.when) ? 0 : +messageObj.when,
      telem_time     : isNaN(body.ts) ? messageObj.when : +body.ts,
      temperature    : getNum(body.temp),
      humidity       : getNum(body.humidity),
      pressure       : getNum(body.pressure),
      sound          : getNum(body.sound),
      current        : getNum(body.current),
      auid,
      pm1            : getNum(body.pm1),
      pm2_5,
      pm10           : getNum(body.pm10),

      // v2-only fields → fall back to 0 if missing in v1
      pm1s           : getNum(body.pm1s),
      pm2_5s         : getNum(body.pm2_5s),
      pm10s          : getNum(body.pm10s),

      lux            : getNum(body.lux),
      battery        : batteryPercentage(voltage),
      uv             : getNum(body.uv),
      aqi            : calculateAQI(pm2_5),
      error          : body.err || "0000"
    };

    // Tower metadata (present in v1 payloads)
    const towerFields = [
      "tower_when", "tower_lat", "tower_lon", "tower_country",
      "tower_location", "tower_timezone", "tower_id"
    ];
    const towerInfo = {};
    for (const f of towerFields) {
      if (messageObj[f] !== undefined) towerInfo[f] = messageObj[f];
    }
    if (Object.keys(towerInfo).length > 0) {
      formattedData.towerInfo = towerInfo;
    }

    console.log(formattedData);

    // Real-time push + Redis caching
    publishToSensor(auid, formattedData);
    await cacheTelemetryToRedis(auid, formattedData, foundDevice);

  } catch (err) {
    console.error("❌ handleEnvQueuedTelemetry Error:", err.message);
  }
}

module.exports = { handleEnvQueuedTelemetry };
