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
        // 1️⃣ Normalize timestamps (same logic as GasSolo)
        //
        const rawTelem = body.ts || body.time;   // 'ts' legacy first, 'time' is Notehub standard
        const rawTransport = messageObj.when;

        let telemTime = normalizeTimestamp(rawTelem);
        let transportTime = normalizeTimestamp(rawTransport);

        // Fallbacks: telem → transport → now
        if (!isValidTimestamp(telemTime)) {
            telemTime = isValidTimestamp(transportTime) ? transportTime : Date.now();
        }
        if (!isValidTimestamp(transportTime)) {
            transportTime = Date.now();
        }

        // 🔒 BATCH FIX: Notehub batches often share the same whole-second epoch.
        // Add random sub-second jitter so Redis keys don't collide across batch entries.
        if (telemTime % 1000 === 0) {
            telemTime += Math.floor(Math.random() * 999);
        }

        //
        // 2️⃣ Parse numeric fields (null-safe — better for graphs than 0)
        //
        const toNumber = (v) => {
            if (v === null || v === undefined || v === '') return null;
            const n = parseFloat(v);
            return isNaN(n) ? null : n;
        };

        const voltage = toNumber(body.voltage);

        //
        // 3️⃣ Build unified telemetry format
        //
        const formattedData = {
            // Timestamps
            timestamp: telemTime,                           // Epoch MS
            telem_time: new Date(telemTime).toISOString(),
            transport_time: new Date(transportTime).toISOString(),

            auid,

            // Standard ENV fields
            temperature: toNumber(body.temp),
            humidity: toNumber(body.humidity),
            pressure: toNumber(body.pressure),
            sound: toNumber(body.sound),
            current: toNumber(body.current),
            lux: toNumber(body.lux),
            uv: toNumber(body.uv),

            // PM values
            pm1: toNumber(body.pm1),
            pm2_5: toNumber(body.pm2_5),
            pm10: toNumber(body.pm10),

            // v2 secondary PM values
            pm1s: toNumber(body.pm1s),
            pm2_5s: toNumber(body.pm2_5s),
            pm10s: toNumber(body.pm10s),

            voltage,
            battery: batteryPercentage(voltage ?? 0),
            aqi: calculateAQI(toNumber(body.pm2_5) ?? 0),
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
