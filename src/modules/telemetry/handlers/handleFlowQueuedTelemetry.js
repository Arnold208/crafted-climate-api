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
        const foundDevice = await registerNewDevice.findOne({ devid }).select("-_id");
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

        const formattedData = {
            auid,
            devid,
            timestamp: telemTime,
            telem_time: new Date(telemTime).toISOString(),
            transport_time: new Date(transportTime).toISOString(),
            pump: body.pump === true || body.pump === "true",
            manual: body.manual === true || body.manual === "true",
            health: body.health || "0000",
            tank_full: body.tank_full ?? body.tf,
            tank_empty: body.tank_empty ?? body.te,
            tank_mm: body.tank_mm ?? body.tmm,
            tank_l: body.tank_l ?? body.tl,
            bat_v: body.bat_v ?? body.v,
            bat_ma: body.bat_ma ?? body.c,
            bat_mw: body.bat_mw,
            next_cycle: (body.next_cycle || body.nc) ? new Date(normalizeTimestamp(body.next_cycle || body.nc)) : null
        };

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

        // Optional: Save to DB if needed immediately, though workers usually handle persistence 
        // or a separate process flushes Redis to Mongo.
        // await FlowTelemetry.create(formattedData);

    } catch (err) {
        console.error("❌ handleFlowQueuedTelemetry Error:", err.message);
    }
}

module.exports = { handleFlowQueuedTelemetry };
