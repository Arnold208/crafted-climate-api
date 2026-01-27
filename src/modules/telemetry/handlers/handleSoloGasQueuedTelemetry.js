const registerNewDevice = require("../../../models/devices/registerDevice");
const gasSoloTelemetry = require("../../../models/telemetry/gasSoloModel");
const { batteryPercentage } = require("../../../utils/batteryPercentage");
const { cacheTelemetryToRedis } = require("../../../utils/redisTelemetry");
const { publishToAUID } = require("../../../config/socket/socketio");
const { checkThresholds } = require("../../../utils/thresholdEngine");

//
// --- TIMESTAMP HELPERS ----------------------------------
//

function normalizeTimestamp(raw) {
    if (!raw) return 0;

    // ISO → epoch-ms
    if (typeof raw === "string" && raw.includes("T")) {
        const parsed = Date.parse(raw);
        return isNaN(parsed) ? 0 : parsed;
    }

    let ts = Number(raw);
    if (isNaN(ts) || ts <= 0) return 0;

    // seconds → milliseconds
    if (ts < 1e12) ts = ts * 1000;

    return ts;
}

function isValidTimestamp(ts) {
    if (!ts) return false;
    const d = new Date(ts);
    return !isNaN(d.getTime()) && d.getFullYear() >= 2020;
}

function getNum(v, def = 0) {
    const n = parseFloat(v);
    return isNaN(n) ? def : n;
}

//
// --- MAIN HANDLER ---------------------------------------
//

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

        //
        // 1️⃣ Normalize timestamps (same logic as AQUA & ENV)
        //
        const rawTelem = body.ts;
        const rawTransport = messageObj.when;

        let telemTime = normalizeTimestamp(rawTelem);
        let transportTime = normalizeTimestamp(rawTransport);

        if (!isValidTimestamp(telemTime)) {
            telemTime = transportTime;
        }
        if (!isValidTimestamp(telemTime)) {
            telemTime = Date.now();
        }

        //
        // 2️⃣ Parse numeric fields
        //
        const voltage = getNum(body.voltage);

        //
        // 3️⃣ Build unified telemetry format
        //
        const formattedData = {
            timestamp: telemTime,
            telem_time: new Date(telemTime).toISOString(),
            transport_time: new Date(transportTime).toISOString(),

            auid,

            // GasSolo data
            temperature: getNum(body.temp),
            humidity: getNum(body.humidity),
            pressure: getNum(body.pressure),
            aqi: getNum(body.aqi),
            current: getNum(body.current),
            eco2_ppm: getNum(body.eco2_ppm),
            tvoc_ppb: getNum(body.tvoc_ppb),

            // Power
            voltage: voltage,
            battery: batteryPercentage(voltage),

            error: body.err || "0000"
        };

        //
        // 4️⃣ Tower metadata (unchanged)
        //
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

        console.log("🔥 GAS-SOLO Normalized telemetry:", formattedData);

        //
        // 5️⃣ Redis cache + real time broadcast
        //
        await cacheTelemetryToRedis(auid, formattedData, foundDevice);
        publishToAUID(auid, formattedData);

        //
        // 6️⃣ Run threshold engine
        //
        checkThresholds(auid, formattedData);

        //
        // 7️⃣ Optional DB insert
        //
        // await gasSoloTelemetry.create(formattedData);

    } catch (err) {
        console.error("❌ handleGasSoloQueuedTelemetry Error:", err.message);
    }
}

module.exports = { handleGasSoloQueuedTelemetry };
