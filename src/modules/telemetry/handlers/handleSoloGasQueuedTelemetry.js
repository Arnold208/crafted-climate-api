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
        const rawTelem = body.ts || body.time;
        const rawTransport = messageObj.when;

        let telemTime = normalizeTimestamp(rawTelem);
        let transportTime = normalizeTimestamp(rawTransport);

        if (!isValidTimestamp(telemTime)) {
            telemTime = transportTime;
        }
        if (!isValidTimestamp(telemTime)) {
            telemTime = Date.now();
        }

        // 🔒 BATCH FIX: If purely second-based timestamp (from Notehub sometimes), 
        // add random MS to prevent Redis key collision if multiple readings have same second.
        // (Redis key is typically just the timestamp)
        if (telemTime % 1000 === 0) {
            telemTime += Math.floor(Math.random() * 999);
        }

        //
        // 2️⃣ Parse numeric fields
        //
        const voltage = getNum(body.voltage);

        //
        // 3️⃣ Build unified telemetry format
        //
        //
        // 3️⃣ Build unified telemetry format
        //

        // Helper: Convert to number, default to 0
        const toNumber = (v) => {
            const n = parseFloat(v);
            return isNaN(n) ? 0 : n;
        };

        const formattedData = {
            timestamp: telemTime, // Epoch MS
            telem_time: new Date(telemTime).toISOString(),
            transport_time: new Date(transportTime).toISOString(),

            auid,

            // STRICT MAPPING (1:1 with Payload)

            // Raw Payload Fields
            comp_temp: toNumber(body.comp_temp),
            comp_humi: toNumber(body.comp_humi),
            // box_pres mapped below to box_pressure

            // Box/Env specific
            box_temperature: toNumber(body.box_temp),
            box_humidity: toNumber(body.box_humi),
            box_pressure: toNumber(body.box_pres),

            // Gas Readings
            aqi: toNumber(body.aqi),
            current: toNumber(body.current),

            // Strict Payload Gas Fields
            eco2: toNumber(body.eco2),
            tvoc: toNumber(body.tvoc),
            // Legacy/Schema compatibility
            eco2_ppm: toNumber(body.eco2),
            tvoc_ppb: toNumber(body.tvoc),

            // Generic / Dashboard Standard Fields
            temperature: toNumber(body.comp_temp), // Best available ambient temp
            humidity: toNumber(body.comp_humi),    // Best available ambient humidity
            pressure: toNumber(body.box_pres),     // Best available pressure

            // Power
            voltage: toNumber(body.voltage),
            battery: batteryPercentage(toNumber(body.voltage)),
            brownout: toNumber(body.brownout),

            // Device Info
            mode: body.mode || 'normal',
            v_type: body.v_type || 'real',
            ver: body.ver || '',
            devmod: body.devmod || '',
            boot: toNumber(body.boot),

            // Errors
            err_count: toNumber(body.err_count),
            err_status: body.err_status || "0000",
            error: body.error || "0000"
        };

        // 🛡️ DATA QUALITY CHECK: Filter out "Zombie" packets (All zeros)
        // These often occur during sensor initialization or hard faults.
        // 🛡️ DATA QUALITY CHECK: Filter out "Zombie" packets
        // A packet is invalid if BOTH Environment AND Gas Data are missing/zero.
        // We allow voltage/current to be non-zero (power monitoring), but if sensors are dead, it's useless for dashboard.
        const isEnvDead = (formattedData.comp_temp === 0 && formattedData.comp_humi === 0 && formattedData.pressure === 0);
        const isGasDead = (formattedData.aqi === 0 && formattedData.eco2 === 0 && formattedData.tvoc === 0);

        if (isEnvDead && isGasDead) {
            console.warn(`🛑 DROPPED Zombie Telemetry for ${devid}:`, {
                comp_temp: formattedData.comp_temp,
                comp_humi: formattedData.comp_humi,
                pressure: formattedData.pressure,
                aqi: formattedData.aqi,
                eco2: formattedData.eco2,
                tvoc: formattedData.tvoc
            });
            return;
        }

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
        //
        // 7️⃣ Optional DB insert
        //
        // await gasSoloTelemetry.create(formattedData);

    } catch (err) {
        console.error("❌ handleGasSoloQueuedTelemetry Error:", err.message);
    }
}

module.exports = { handleGasSoloQueuedTelemetry };
