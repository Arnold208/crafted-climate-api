const registerNewDevice = require("../../../models/devices/registerDevice");
const FlowTelemetry = require("../../../models/telemetry/flowModel");
const { batteryPercentage } = require("../../../utils/batteryPercentage");
const { cacheTelemetryToRedis } = require('../../../utils/redisTelemetry');
const { publishToAUID } = require("../../../config/socket/socketio");
const { checkThresholds } = require("../../../utils/thresholdEngine");

function normalizeTimestamp(raw) {
    if (!raw) return 0;
    if (typeof raw === "string" && raw.includes("T")) {
        const parsed = Date.parse(raw);
        return isNaN(parsed) ? 0 : parsed;
    }
    let ts = Number(raw);
    if (isNaN(ts) || ts <= 0) return 0;
    if (ts < 1e12) ts = ts * 1000;
    return ts;
}

function isValidTimestamp(ts) {
    if (!ts) return false;
    const d = new Date(ts);
    return !isNaN(d.getTime()) && d.getFullYear() >= 2020;
}

async function handleFlowQueuedTelemetry(messageObj) {
    const body = messageObj.body;
    const devid = body?.devid;

    if (!devid) {
        console.warn("⚠️ No 'devid' in Flow payload.");
        return;
    }

    try {
        const foundDevice = await registerNewDevice.findOne({ devid }).select("-__v");
        if (!foundDevice) {
            console.warn(`❌ Device not registered: ${devid}`);
            return;
        }

        const auid = foundDevice.auid;
        const rawTelem = body.timestamp || body.ts || body.time;
        const rawTransport = messageObj.receivedAt || messageObj.when;

        let telemTime = normalizeTimestamp(rawTelem);
        let transportTime = normalizeTimestamp(rawTransport);

        if (!isValidTimestamp(transportTime)) transportTime = Date.now();
        if (!isValidTimestamp(telemTime)) telemTime = transportTime;

        // A. Configuration Check
        if (foundDevice.setup?.is_configured === false) {
            console.warn(`⚠️ Device ${devid} reporting telemetry but is NOT yet configured.`);
        }

        const formattedData = {
            auid,
            devid,
            timestamp: telemTime,
            telem_time: new Date(telemTime).toISOString(),
            transport_time: new Date(transportTime).toISOString(),
            pump: body.pump === true || body.pump === "true",
            manual: body.manual === true || body.manual === "true",
            op_mode: body.op_mode || body.mode,
            health: body.health || "0000",
            tank_full: body.tank_full ?? body.tf,
            tank_empty: body.tank_empty ?? body.te,
            tank_mm: body.tank_mm ?? body.tmm ?? 0,
            tank_l: body.tank_l ?? body.tl ?? 0,
            bat_v: body.bat_v ?? body.v ?? 0,
            bat_ma: body.bat_ma ?? body.c ?? 0,
            bat_mw: body.bat_mw ?? 0,
            sensor_ok: body.sensor_ok ?? true,
            sleeping: body.sleeping ?? false,
            sleep_enabled: body.sleep_enabled ?? false,
            stop_reason: body.stop_reason || "none",
            next_cycle: (body.next_cycle || body.nc) ? new Date(normalizeTimestamp(body.next_cycle || body.nc)) : null,
            pump_session: body.pump_session ? {
                duration_s: body.pump_session.duration_s ?? body.ps_dur ?? 0,
                avg_ma: body.pump_session.avg_ma ?? body.ps_ama ?? 0,
                avg_mw: body.pump_session.avg_mw ?? body.ps_amw ?? 0,
                min_v: body.pump_session.min_v ?? body.ps_minv ?? 0,
                max_v: body.pump_session.max_v ?? body.ps_maxv ?? 0,
                samples: body.pump_session.samples ?? body.ps_sam ?? 0
            } : null,
            // Flattened for CSV compatibility
            ps_duration: body.pump_session?.duration_s ?? body.ps_dur ?? 0,
            ps_avg_ma: body.pump_session?.avg_ma ?? body.ps_ama ?? 0,
            ps_avg_mw: body.pump_session?.avg_mw ?? body.ps_amw ?? 0,
            ps_min_v: body.pump_session?.min_v ?? body.ps_minv ?? 0,
            ps_max_v: body.pump_session?.max_v ?? body.ps_maxv ?? 0,
            ps_samples: body.pump_session?.samples ?? body.ps_sam ?? 0
        };

        // B. Tank Calculation (Server-Side Override)
        const setup = foundDevice.setup || {};
        if (setup.tank_height_mm && setup.tank_volume_l) {
            const rawMm = formattedData.tank_mm;
            let percentage = (rawMm / setup.tank_height_mm) * 100;
            percentage = Math.min(100, Math.max(0, percentage)); // Cap 0-100

            const liters = (percentage / 100) * setup.tank_volume_l;

            formattedData.tank_percentage = parseFloat(percentage.toFixed(2));
            formattedData.tank_l = parseFloat(liters.toFixed(2));
            console.log(`🧮 Server-side Tank Calc for ${devid}: ${percentage.toFixed(1)}% (${liters.toFixed(1)}L)`);
        }

        // C. Power-Based Filtering
        const pwr = foundDevice.power_system?.capabilities || { solar: true, battery: true, ac_input: false };

        if (pwr.battery === false) {
            delete formattedData.bat_v;
            delete formattedData.bat_ma;
            delete formattedData.bat_mw;
        }

        const towerFields = [
            "tower_when", "tower_lat", "tower_lon", "tower_country",
            "tower_location", "tower_timezone", "tower_id"
        ];
        const towerInfo = {};
        for (const field of towerFields) {
            if (messageObj[field] !== undefined) towerInfo[field] = messageObj[field];
        }
        if (Object.keys(towerInfo).length > 0) formattedData.towerInfo = towerInfo;

        console.log("📡 Normalized Flow telemetry:", formattedData);

        await cacheTelemetryToRedis(auid, formattedData, foundDevice);
        publishToAUID(auid, formattedData);
        checkThresholds(auid, formattedData);

    } catch (err) {
        console.error("❌ handleFlowQueuedTelemetry Error:", err.message);
    }
}

module.exports = { handleFlowQueuedTelemetry };
