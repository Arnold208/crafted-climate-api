const registerNewDevice = require("../../../models/devices/registerDevice");
const deviceTelemetry = require("../../../models/telemetry/envModel");
const { batteryPercentage } = require("../../../utils/batteryPercentage");
const { calculateAQI } = require("../../../utils/aqiFunction");
const { cacheTelemetryToRedis } = require('../../../utils/redisTelemetry');
const { publishToAUID } = require("../../../config/socket/socketio");
const { checkThresholds } = require("../../../utils/thresholdEngine");

//
// --- TIMESTAMP NORMALIZATION ------------------------------
//

function normalizeTimestamp(raw) {
    if (!raw) return 0;

    // ISO dates
    if (typeof raw === "string" && raw.includes("T")) {
        const parsed = Date.parse(raw);
        return isNaN(parsed) ? 0 : parsed;
    }

    let ts = Number(raw);
    if (isNaN(ts) || ts <= 0) return 0;

    // Seconds → ms
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
// --- MAIN HANDLER ----------------------------------------
//

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

        //
        // --- TIMESTAMP PROCESSING (same as AQUA) --------------
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
        // --- BUILD FORMATTED PAYLOAD -------------------------
        //
        const voltage = getNum(body.voltage);

        const formattedData = {
            // Unified timestamp structure
            timestamp: telemTime,
            telem_time: new Date(telemTime).toISOString(),
            transport_time: new Date(transportTime).toISOString(),

            auid,

            // Standard ENV fields
            temperature: getNum(body.temp),
            humidity: getNum(body.humidity),
            pressure: getNum(body.pressure),
            sound: getNum(body.sound),
            current: getNum(body.current),
            lux: getNum(body.lux),
            uv: getNum(body.uv),

            // PM values
            pm1: getNum(body.pm1),
            pm2_5: getNum(body.pm2_5),
            pm10: getNum(body.pm10),

            // v2 values
            pm1s: getNum(body.pm1s),
            pm2_5s: getNum(body.pm2_5s),
            pm10s: getNum(body.pm10s),

            voltage,
            battery: batteryPercentage(voltage),
            aqi: calculateAQI(getNum(body.pm2_5)),
            error: body.err || "0000"
        };

        //
        // --- TOWER METADATA -----------------------------------
        //
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

        console.log("🌿 ENV formatted telemetry:", formattedData);

        //
        // --- REDIS + REALTIME ---------------------------------
        //
        await cacheTelemetryToRedis(auid, formattedData, foundDevice);
        publishToAUID(auid, formattedData);
        checkThresholds(auid, formattedData);

        // Optional DB save:
        // await deviceTelemetry.create(formattedData);

    } catch (err) {
        console.error("❌ handleEnvQueuedTelemetry Error:", err.message);
    }
}

module.exports = { handleEnvQueuedTelemetry };
