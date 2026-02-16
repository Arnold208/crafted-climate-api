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
        const rawTelem = body.ts || body.time;
        const rawTransport = messageObj.when;

        let telemTime = normalizeTimestamp(rawTelem);
        let transportTime = normalizeTimestamp(rawTransport);

        if (!isValidTimestamp(telemTime)) telemTime = transportTime;
        if (!isValidTimestamp(telemTime)) telemTime = Date.now();

        const bat_v = parseFloat(body.v);
        const formattedData = {
            fid: devid,
            timestamp: telemTime,
            telem_time: new Date(telemTime).toISOString(),
            transport_time: new Date(transportTime).toISOString(),
            mode: body.mode || "AUTO",
            pump: body.pump === true || body.pump === "true",
            hcode: body.hc || "0000",
            tank_full: body.tf === true || body.tf === "true",
            tank_empty: body.te === true || body.te === "true",
            tank_mm: +body.tmm || 0,
            tank_l: +body.tl || 0,
            flow_lpm: +body.fl || 0,
            flow_hz: +body.fhz || 0,
            bat_v: isNaN(bat_v) ? 0 : bat_v,
            bat_ma: +body.c || 0,
            solar_v: +body.sv || 0,
            solar_ma: +body.sma || 0,
            solar_mw: +body.smw || 0,
            pump_ma: +body.pm || 0,
            pump_mw: +body.pw || 0,
            next_cycle: body.nc ? new Date(normalizeTimestamp(body.nc)) : null,
            wifi_rssi: +body.rssi || 0,
            error: body.err || "0000",
            auid
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
