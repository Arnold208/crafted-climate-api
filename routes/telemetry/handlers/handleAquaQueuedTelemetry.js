// const registerNewDevice = require("../../../model/devices/registerDevice");
// const deviceTelemetry = require("../../../model/telemetry/aquaModel");
// const { batteryPercentage } = require("../../../utils/batteryPercentage");
// const { cacheTelemetryToRedis } = require('../../../utils/redisTelemetry');
// const { publishToAUID } = require("../../../config/socket/socketio");
// const { checkThresholds } = require("../../../utils/thresholdEngine");

// async function handleAquaQueuedTelemetry(messageObj) {
//   const body = messageObj.body;
//   const devid = body?.devid;

//   if (!devid) {
//     console.warn("⚠️ No 'devid' in payload.");
//     return;
//   }

//   try {
//     const foundDevice = await registerNewDevice.findOne({ devid }).select("-_id");
//     if (!foundDevice) {
//       console.warn(`❌ Device not registered: ${devid}`);
//       return;
//     }

//     const auid = foundDevice.auid;

//     // Parse common inputs
//     const voltage = parseFloat(body.voltage);

//     const formattedData = {
//       transport_time: isNaN(messageObj.when) ? 0 : +messageObj.when,
//       telem_time: isNaN(body.ts) ? messageObj.when : +body.ts,
//       ec: isNaN(body.ec) ? 0 : +body.ec,
//       humidity: isNaN(body.humidity) ? 0 : +body.humidity,
//       temperature_water: isNaN(body.temperature_water) ? 0 : +body.temperature_water,
//       temperature_ambient: isNaN(body.temperature_ambient) ? 0 : +body.temperature_ambient,
//       pressure: isNaN(body.pressure) ? 0 : +body.pressure,
//       ph: isNaN(body.ph) ? 0 : +body.ph,
//       lux: isNaN(body.lux) ? 0 : +body.lux,
//       turbidity: isNaN(body.turbidity) ? 0 : +body.turbidity,
//       voltage: isNaN(voltage) ? 0 : voltage,
//       current: isNaN(body.current) ? 0 : +body.current,
//       battery: isNaN(voltage) ? 0 : batteryPercentage(voltage),
//       error: body.err || "0000",
//       auid
//     };

//     // Optional tower metadata
//     const towerFields = [
//       "tower_when", "tower_lat", "tower_lon", "tower_country",
//       "tower_location", "tower_timezone", "tower_id"
//     ];
//     const towerInfo = {};
//     for (const field of towerFields) {
//       if (messageObj[field] !== undefined) {
//         towerInfo[field] = messageObj[field];
//       }
//     }
//     if (Object.keys(towerInfo).length > 0) {
//       formattedData.towerInfo = towerInfo;
//     }

//     console.log("📡 Formatted telemetry:", formattedData);

    
//     // 🧠 Cache for fast reads
//     await cacheTelemetryToRedis(auid, formattedData, foundDevice);

//     // 🚀 Real-time broadcast
//     publishToAUID(auid, formattedData);
//     checkThresholds(auid, formattedData);


//     // 🗄️ Optional: persist to Mongo
//     // await deviceTelemetry.create(formattedData);

//   } catch (err) {
//     console.error("❌ handleAquaQueuedTelemetry Error:", err.message);
//   }
// }

// module.exports = { handleAquaQueuedTelemetry };

const registerNewDevice = require("../../../model/devices/registerDevice");
const deviceTelemetry = require("../../../model/telemetry/aquaModel");
const { batteryPercentage } = require("../../../utils/batteryPercentage");
const { cacheTelemetryToRedis } = require('../../../utils/redisTelemetry');
const { publishToAUID } = require("../../../config/socket/socketio");
const { checkThresholds } = require("../../../utils/thresholdEngine");

function normalizeTimestamp(raw) {
  if (!raw) return 0;

  // ISO → epoch ms
  if (typeof raw === "string" && raw.includes("T")) {
    const parsed = Date.parse(raw);
    return isNaN(parsed) ? 0 : parsed;
  }

  let ts = Number(raw);
  if (isNaN(ts) || ts <= 0) return 0;

  // seconds → ms
  if (ts < 1e12) ts = ts * 1000;

  return ts;
}

function isValidTimestamp(ts) {
  if (!ts) return false;
  const d = new Date(ts);
  return !isNaN(d.getTime()) && d.getFullYear() >= 2020;
}

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

    // -----------------------------------------------------
    // TIMESTAMP NORMALIZATION (Fixes all inconsistency)
    // -----------------------------------------------------
    const rawTelem = body.ts;
    const rawTransport = messageObj.when;

    let telemTime = normalizeTimestamp(rawTelem);
    let transportTime = normalizeTimestamp(rawTransport);

    // Fallback if telem timestamp bad
    if (!isValidTimestamp(telemTime)) {
      telemTime = transportTime;
    }

    // Final fallback: now
    if (!isValidTimestamp(telemTime)) {
      telemTime = Date.now();
    }

    // -----------------------------------------------------
    // Format telemetry
    // -----------------------------------------------------
    const voltage = parseFloat(body.voltage);
    const formattedData = {
      timestamp: telemTime,                       // epoch ms
      telem_time: new Date(telemTime).toISOString(),  // ISO format
      transport_time: new Date(transportTime).toISOString(),
      ec: +body.ec || 0,
      humidity: +body.humidity || 0,
      temperature_water: +body.temperature_water || 0,
      temperature_ambient: +body.temperature_ambient || 0,
      pressure: +body.pressure || 0,
      ph: +body.ph || 0,
      lux: +body.lux || 0,
      turbidity: +body.turbidity || 0,
      voltage: isNaN(voltage) ? 0 : voltage,
      current: +body.current || 0,
      battery: isNaN(voltage) ? 0 : batteryPercentage(voltage),
      error: body.err || "0000",
      auid
    };

    // -----------------------------------------------------
    // Tower metadata (unchanged)
    // -----------------------------------------------------
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

    console.log("📡 Normalized telemetry:", formattedData);

    // -----------------------------------------------------
    // Cache to Redis
    // -----------------------------------------------------
    await cacheTelemetryToRedis(auid, formattedData, foundDevice);

    // -----------------------------------------------------
    // Real-time broadcast
    // -----------------------------------------------------
    publishToAUID(auid, formattedData);
    checkThresholds(auid, formattedData);

    // -----------------------------------------------------
    // Optional DB insert
    // -----------------------------------------------------
    // await deviceTelemetry.create(formattedData);

  } catch (err) {
    console.error("❌ handleAquaQueuedTelemetry Error:", err.message);
  }
}

module.exports = { handleAquaQueuedTelemetry };
