const registerNewDevice = require("../../../model/devices/registerDevice");
const deviceTelemetry = require("../../../model/telemetry/aquaModel"); // was envModel
const { batteryPercentage } = require("../../../utils/batteryPercentage");
const { cacheTelemetryToRedis } = require('../../../utils/redisTelemetry');
const { publishToSensor } = require("../../../config/socket/socketio");

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
      // Timestamps
      transport_time: isNaN(messageObj.when) ? 0 : +messageObj.when,
      telem_time: isNaN(body.ts) ? messageObj.when : +body.ts,

      // Aqua datapoints
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

      // Derived/metadata
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

    console.log(formattedData);

    // Real-time push
    publishToSensor(auid, formattedData);

    // Cache latest for fast reads
    await cacheTelemetryToRedis(auid, formattedData, foundDevice);

    // If/when you want to persist to Mongo, uncomment:
    // await deviceTelemetry.create(formattedData);

  } catch (err) {
    console.error("❌ handleAquaQueuedTelemetry Error:", err.message);
  }
}

module.exports = { handleAquaQueuedTelemetry };


// {
//   "message": "Device manufactured successfully",
//   "device": {
//     "devid": "2aqua01",
//     "type": "Cellular",
//     "model": "aqua",
//     "mac": "C8:3A:35:AB:12:49",
//     "manufacturingId": "UAUUMRMBA538_Z80QDI5S",
//     "sku": "CS-AQUA",
//     "batchNumber": "CC-2025-0006",
//     "serial": "GH-D6D7D0HHY6",
//     "auid": "GH-YV91YJL2DIN_TWBS9W7AR",
//     "status": "MANUFACTURED",
//     "datapoints": [
//       "ec",
//       "humidity",
//       "temperature_water",
//       "temperature_ambient",
//       "humidity",
//       "pressure",
//       "ph",
//       "lux",
//       "turbidity",
//       "voltage",
//       "current"
//     ],
//     "_id": "68bf2936595220e73cfac55c",
//     "date": "2025-09-08T19:06:30.771Z"
//   }
// }