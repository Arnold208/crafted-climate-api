const { client: redisClient } = require('../../config/redis/redis');
const CacheService = require('../common/cache.service');
const registerNewDevice = require('../../models/devices/registerDevice');
const EnvTelemetry = require('../../models/telemetry/envModel');
const AquaTelemetry = require('../../models/telemetry/aquaModel');
const GasSoloTelemetry = require('../../models/telemetry/gasSoloModel');
const FlowTelemetry = require('../../models/telemetry/flowModel');
const SensorModel = require('../../models/devices/deviceModels');

const { mapTelemetryData } = require('../../utils/telemetryMapper');
const { cacheTelemetryToRedis } = require('../../utils/redisTelemetry');
const { calculateAQI } = require('../../utils/aqiFunction');
const { getDeviceCache, setDeviceCache } = require('../../utils/deviceCache');

const MODEL_MAP = {
    env: EnvTelemetry,
    aqua: AquaTelemetry,
    'gas-solo': GasSoloTelemetry,
    'gassolo': GasSoloTelemetry, // Alias for safety
    flow: FlowTelemetry
};

const CSV_COLUMNS = {
    env: [
        'auid', 'transport_time', 'telem_time', 'temperature', 'humidity', 'pressure', 'altitude',
        'pm1', 'pm2_5', 'pm10', 'pm1s', 'pm2_5s', 'pm10s', 'lux', 'uv', 'sound', 'aqi', 'voltage', 'current', 'battery', 'error'
    ],
    aqua: [
        'auid', 'transport_time', 'telem_time', 'ec', 'humidity', 'temperature_water', 'temperature_ambient',
        'pressure', 'ph', 'do', 'lux', 'turbidity', 'voltage', 'current', 'aqi', 'battery', 'error'
    ],
    'gas-solo': [
        'auid', 'transport_time', 'telem_time', 'temperature', 'humidity', 'pressure',
        'box_temperature', 'box_humidity', 'box_pressure',
        'aqi', 'current', 'eco2_ppm', 'tvoc_ppb', 'voltage', 'battery', 'error', 'err_count',
        'mode', 'v_type', 'ver', 'devmod', 'boot', 'brownout',
        'comp_temp', 'comp_humi', 'eco2', 'tvoc', 'err_status'
    ],
    flow: [
        'auid', 'devid', 'transport_time', 'telem_time', 'pump', 'manual', 'op_mode', 'health',
        'sensor_ok', 'sleeping', 'sleep_enabled', 'stop_reason',
        'tank_full', 'tank_empty', 'tank_mm', 'tank_l',
        'bat_v', 'bat_ma', 'bat_mw', 'next_cycle',
        'ps_duration', 'ps_avg_ma', 'ps_avg_mw', 'ps_min_v', 'ps_max_v', 'ps_samples'
    ],
    // Alias to match the above array reference if needed, but robust lookup is better
};
CSV_COLUMNS.gassolo = CSV_COLUMNS['gas-solo'];

class TelemetryService {

    _resolveModelKey(model) {
        const m = model.toLowerCase();
        if (m === 'gassolo' || m === 'gas-solo') return 'gas-solo';
        return m;
    }

    async ingestTelemetry(modelName, deviceId, payload) {
        modelName = this._resolveModelKey(modelName);
        let device;

        // 1. Check Redis Cache First
        const cachedDevice = await getDeviceCache(deviceId);

        if (cachedDevice) {
            if (cachedDevice.model && cachedDevice.model.toLowerCase() !== modelName) {
                throw new Error(`Device model mismatch. Expected ${cachedDevice.model}, got ${modelName}`);
            }
            device = cachedDevice;
        } else {
            // Cache Miss
            // OPTIMIZATION: Cache Sensor Model Definition (Safe, 7 days TTL)
            // Key: model:{name}:def
            const modelExists = await CacheService.getOrSet(`model:${modelName}:def`, async () => {
                return await SensorModel.findOne({ model: modelName });
            }, 604800); // 7 Days

            if (!modelExists) {
                throw new Error(`Model '${modelName}' not found`); // 404
            }

            const dbDevice = await registerNewDevice.findOne({ devid: deviceId });
            if (!dbDevice) {
                throw new Error('Device not found'); // 404
            }

            await setDeviceCache(deviceId, dbDevice);
            device = dbDevice;
        }

        // 2. Map Telemetry
        const mappedTelemetry = mapTelemetryData(modelName, payload, device.datapoints);
        if (!mappedTelemetry.date) {
            throw new Error('Missing timestamp field (d)'); // 400
        }

        const aqi = calculateAQI(mappedTelemetry.pm2_5);
        mappedTelemetry.aqi = aqi;
        mappedTelemetry.auid = device.auid;

        // 3. Cache to Redis + Dirty Set
        await cacheTelemetryToRedis(device.auid, mappedTelemetry, device);

        // 4. Trigger Status Update (Heartbeat)
        const { statusQueue } = require('../../config/queue/bullMQ/bullqueue');
        await statusQueue.add('processStatus', {
            body: { devid: deviceId }
        }, {
            removeOnComplete: true,
            removeOnFail: true
        });

        const config = {
            CC_NET_MODE: device.netMode || 'cellular',
            CC_FREQUENCY: device.frequency || 30,
            CC_BATCH: device.batch || 2,
            CC_STATE: device.state || 'active'
        };

        return { success: true, config };
    }

    /**
     * Ingest telemetry sent from UDP Satellite gateway
     */
    async ingestSatelliteTelemetry(body) {
        const { device_id, received_utc, source_ip, source_port, received_via, payload } = body || {};

        if (!device_id) {
            throw new Error('Missing device_id'); // 400
        }

        if (!payload || typeof payload !== 'object') {
            throw new Error('Missing or invalid telemetry payload'); // 400
        }

        // 1. Device Lookup (devid, auid, or serial)
        let device = await getDeviceCache(device_id);

        if (!device) {
            const dbDevice = await registerNewDevice.findOne({
                $or: [
                    { devid: device_id },
                    { auid: device_id },
                    { serial: device_id }
                ]
            });

            if (!dbDevice) {
                throw new Error(`Device '${device_id}' not found`); // 404
            }

            await setDeviceCache(device_id, dbDevice);
            device = dbDevice;
        }

        // 2. Parse Timestamps
        const transportDate = received_utc ? new Date(received_utc) : new Date();
        const timestampMs = isNaN(transportDate.getTime()) ? Date.now() : transportDate.getTime();

        // 3. Build Telemetry Object for storage
        const mappedTelemetry = {
            auid: device.auid,
            transport_time: transportDate,
            telem_time: transportDate,
            date: timestampMs,
            timestamp: timestampMs,
            temperature: typeof payload.temperature_c === 'number' ? payload.temperature_c : 0,
            humidity: typeof payload.humidity_pct === 'number' ? payload.humidity_pct : 0,
            pressure: typeof payload.pressure_hpa === 'number' ? payload.pressure_hpa : 0,
            gas_raw: typeof payload.gas_raw === 'number' ? payload.gas_raw : 0,
            sequence: typeof payload.sequence === 'number' ? payload.sequence : 0,
            raw_hex: payload.raw_hex || '',
            aqi: calculateAQI(0),
            towerInfo: {
                source_ip: source_ip || null,
                source_port: source_port || null,
                received_via: received_via || 'udp_gateway',
                satellite_sequence: payload.sequence ?? null,
                satellite_raw_hex: payload.raw_hex || null,
                satellite_gas_raw: payload.gas_raw ?? null,
                received_utc: received_utc || transportDate.toISOString()
            }
        };

        // 4. Cache to Redis + Dirty Set
        await cacheTelemetryToRedis(device.auid, mappedTelemetry, device);

        // 5. Trigger Status Update (Heartbeat)
        const { statusQueue } = require('../../config/queue/bullMQ/bullqueue');
        await statusQueue.add('processStatus', {
            body: { devid: device.devid }
        }, {
            removeOnComplete: true,
            removeOnFail: true
        });

        const config = {
            CC_NET_MODE: device.netMode || 'satellite',
            CC_FREQUENCY: device.frequency || 30,
            CC_BATCH: device.batch || 2,
            CC_STATE: device.state || 'active'
        };

        return {
            success: true,
            message: 'Satellite telemetry processed successfully',
            auid: device.auid,
            devid: device.devid,
            config
        };
    }

    /**
     * Get Telemetry (Redis -> Mongo Fallback)
     */
    async getDeviceTelemetry(userid, auid, limit = 50, orgRole = null) {
        const device = await registerNewDevice.findOne({ auid });
        if (!device) {
            throw new Error('Device not found'); // 404
        }

        // Setup Guard
        this._checkFlowConfigStatus(device);

        const isOwner = device.userid === userid;
        const isCollaborator = device.collaborators?.some(c => c.userid === userid);

        // FIX: Allow Org Admins and Support to view ALL devices in their Org
        const isOrgAdmin = orgRole === 'org-admin' || orgRole === 'org-support';

        if (!isOwner && !isCollaborator && !isOrgAdmin) {
            throw new Error('Unauthorized access'); // 403
        }

        // 2. Try Redis
        const entries = await redisClient.hGetAll(auid);

        if (entries && Object.keys(entries).length > 0) {
            const metadata = entries.metadata ? JSON.parse(entries.metadata) : null;
            const telemetryData = Object.entries(entries)
                .filter(([key]) => key !== 'metadata' && key !== 'flushed')
                .map(([key, value]) => {
                    try {
                        const parsed = JSON.parse(value);
                        return { timestamp: key, ...parsed };
                    } catch { return null; }
                })
                .filter(Boolean)
                .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
                .slice(0, limit); // Descending (Newest -> Oldest)

            if (telemetryData.length > 0) {
                return {
                    source: 'redis',
                    metadata,
                    count: telemetryData.length,
                    telemetry: telemetryData
                };
            }
        }

        // 3. Fallback to Mongo
        const model = device.model?.toLowerCase();
        const resolvedModel = this._resolveModelKey(model);
        const M = MODEL_MAP[resolvedModel];
        if (!M) {
            throw new Error(`No telemetry model for '${model}'`);
        }

        const telemetryData = await M.find({ auid })
            .sort({ transport_time: -1 })
            .limit(limit)
            .lean();

        if (!telemetryData.length) {
            throw new Error('No telemetry found'); // 404
        }

        return {
            source: 'mongo',
            metadata: device.metadata || null,
            count: telemetryData.length,
            telemetry: telemetryData
        };
    }

    /**
     * Delete Device Telemetry (Redis + Mongo)
     */
    async deleteDeviceTelemetry(userid, auid, orgRole = null) {
        // 1. Check Access
        const device = await registerNewDevice.findOne({ auid });
        if (!device) {
            throw new Error('Device not found'); // 404
        }

        const isOwner = device.userid === userid;
        // Only Owners and Org Admins can delete telemetry
        const isOrgAdmin = orgRole === 'org-admin';

        if (!isOwner && !isOrgAdmin) {
            throw new Error('Unauthorized access'); // 403
        }

        // ============================================================
        // MRV ENGINE: Hard-delete guard
        // Block deletion of telemetry for devices with MRV retention
        // VCS requires immutable evidence chain — cannot hard-delete
        // ============================================================
        try {
            const TelemetryReceipt = require('../../models/mrv/evidence/TelemetryReceipt.model');
            const mrvReceiptCount = await TelemetryReceipt.countDocuments({ auid, retentionClass: 'MRV' });
            if (mrvReceiptCount > 0) {
                const err = new Error(
                    `Cannot hard-delete telemetry for device ${auid}: ${mrvReceiptCount} MRV-retained evidence records exist. ` +
                    `MRV data deletion requires a formal retraction process under VCS programme rules.`
                );
                err.statusCode = 409;
                err.code = 'MRV_RETENTION_BLOCK';
                throw err;
            }
        } catch (mrvErr) {
            if (mrvErr.code === 'MRV_RETENTION_BLOCK') throw mrvErr;
            // If MRV model not loaded yet, allow operational delete (non-MRV devices)
        }

        // 2. Delete from Redis
        await redisClient.del(auid);

        // 3. Delete from Mongo
        const model = device.model?.toLowerCase();
        const resolvedModel = this._resolveModelKey(model);
        const M = MODEL_MAP[resolvedModel];
        if (M) {
            await M.deleteMany({ auid });
        }

        return { success: true };
    }

    /**
     * Get Public Telemetry
     */
    async getPublicTelemetry(minModel, limit = 50, page = 1) {
        const query = { availability: 'public' };
        if (minModel) query.model = minModel.toLowerCase();

        const skip = (Math.max(1, page) - 1) * limit;
        const devices = await registerNewDevice.find(query).skip(skip).limit(limit).lean();

        const result = await Promise.all(
            devices.map(async (device) => {
                try {
                    const all = await redisClient.hGetAll(device.auid);
                    if (!all || Object.keys(all).length === 0) return null;

                    let metadata = all.metadata ? JSON.parse(all.metadata) : null;

                    // Ensure image is included in metadata
                    if (metadata && !metadata.image && device.image) {
                        metadata.image = device.image;
                    } else if (!metadata) {
                        // If no metadata in Redis, construct from device record
                        metadata = {
                            auid: device.auid,
                            nickname: device.nickname,
                            availability: device.availability,
                            status: device.status,
                            battery: device.battery,
                            location: device.location,
                            model: device.model,
                            type: device.type,
                            serial: device.serial,
                            mac: device.mac,
                            image: device.image,
                            collaborators: device.collaborators,
                            statusUpdatedAt: device.statusUpdatedAt
                        };
                    }

                    const entries = [];
                    for (const [field, value] of Object.entries(all)) {
                        if (field === 'metadata' || field === 'flushed') continue;
                        const ts = Number(field);
                        if (!Number.isFinite(ts)) continue;
                        try {
                            const parsed = JSON.parse(value);
                            entries.push([ts, parsed]);
                        } catch { }
                    }

                    if (entries.length === 0) return { metadata, telemetry: [] };

                    entries.sort((a, b) => b[0] - a[0]); // Newest first
                    const telemetry = entries.slice(0, limit).map(([_, v]) => v);

                    return { metadata, telemetry };
                } catch (err) {
                    return null;
                }
            })
        );
        return result.filter(Boolean);
    }

    /**
    * Get Database Telemetry (Direct Mongo Query)
    */
    async getDbTelemetry(auid, model, limit, start, end, userid, organizationId) {
        const resolvedModel = this._resolveModelKey(model);
        const M = MODEL_MAP[resolvedModel];
        if (!M) throw new Error(`Unknown model '${model}'`);

        const query = { auid };

        // 🛡️ Data Retention Enforcement
        const enforceDataRetention = require('../../middleware/subscriptions/enforceDataRetention');
        const retentionFilter = await enforceDataRetention(userid, organizationId);
        Object.assign(query, retentionFilter);

        if (start || end) {
            query.transport_time = query.transport_time || {};
            if (start) query.transport_time.$gte = new Date(isNaN(start) ? start : Number(start));
            if (end) query.transport_time.$lte = new Date(isNaN(end) ? end : Number(end));
        }

        // Setup Guard (Check Flow Config)
        const device = await registerNewDevice.findOne({ auid });
        if (device) this._checkFlowConfigStatus(device);

        const data = await M.find(query).sort({ transport_time: -1 }).limit(limit).lean();
        return data;
    }

    /**
     * Stream CSV (Helper returns cursor and columns)
     * The controller will pipe this to response
     */
    async getCsvCursor(auid, model, start, end, userid, organizationId) {
        const resolvedModel = this._resolveModelKey(model);
        const M = MODEL_MAP[resolvedModel];
        const columns = CSV_COLUMNS[resolvedModel];

        if (!M || !columns) {
            throw new Error(`Unknown model '${model}'`);
        }

        const query = { auid };

        // 🛡️ Data Retention Enforcement
        const enforceDataRetention = require('../../middleware/subscriptions/enforceDataRetention');
        const retentionFilter = await enforceDataRetention(userid, organizationId);
        Object.assign(query, retentionFilter);

        if (start || end) {
            query.transport_time = query.transport_time || {};
            if (start) query.transport_time.$gte = new Date(isNaN(start) ? start : Number(start));
            if (end) query.transport_time.$lte = new Date(isNaN(end) ? end : Number(end));
        }

        // Setup Guard (Check Flow Config)
        const device = await registerNewDevice.findOne({ auid });
        if (device) this._checkFlowConfigStatus(device);

        const cursor = M.find(query)
            .sort({ transport_time: -1 })
            .select(columns.join(' '))
            .lean()
            .cursor();

        return { cursor, columns };
    }

    /**
     * Enterprise: Get Raw Telemetry JSON
     * Bypasses standard aggregations for raw sensor auditing.
     */
    async getRawData(auid, model, limit = 100) {
        const resolvedModel = this._resolveModelKey(model);
        const M = MODEL_MAP[resolvedModel];
        if (!M) throw new Error(`Unknown model '${model}'`);

        // Setup Guard (Check Flow Config)
        const device = await registerNewDevice.findOne({ auid });
        if (device) this._checkFlowConfigStatus(device);

        return await M.find({ auid })
            .sort({ transport_time: -1 })
            .limit(Math.min(limit, 1000))
            .lean();
    }
    /**
 * Get Graph Data (Optimized for Charts)
 * - Requires Date Range
 * - Sorts Ascending (Chronological)
 * - Higher limit than pagination
 */
    async getGraphData(auid, model, start, end, userid, organizationId) {
        const resolvedModel = this._resolveModelKey(model);
        const M = MODEL_MAP[resolvedModel];
        if (!M) throw new Error(`Unknown model '${model}'`);

        if (!start || !end) {
            throw new Error("Start and End dates are required for graph data.");
        }

        const query = {
            auid
        };

        // 🛡️ Data Retention Enforcement
        const enforceDataRetention = require('../../middleware/subscriptions/enforceDataRetention');
        const retentionFilter = await enforceDataRetention(userid, organizationId);

        let effectiveStart = new Date(start);
        const retentionGte = retentionFilter.transport_time?.$gte;

        if (retentionGte && retentionGte > effectiveStart) {
            effectiveStart = retentionGte;
        }

        query.transport_time = {
            $gte: effectiveStart,
            $lte: new Date(end)
        };

        // Setup Guard (Check Flow Config)
        const device = await registerNewDevice.findOne({ auid });
        if (device) this._checkFlowConfigStatus(device);

        // Limit to 5000 points to prevent browser crash, but allow high res
        // Sort Ascending (1) for charts
        // 1. Fetch Historical Data from MongoDB (Base Layer)
        const mongoPromise = M.find(query)
            .sort({ transport_time: 1 })
            .limit(5000)
            .lean();

        // 2. Fetch Latest Data from Redis (Hot Layer)
        const redisPromise = (async () => {
            try {
                const entries = await redisClient.hGetAll(auid);
                if (!entries) return [];

                const redisData = [];
                const startDate = new Date(start).getTime();
                const endDate = new Date(end).getTime();

                for (const [key, value] of Object.entries(entries)) {
                    if (key === 'metadata' || key === 'flushed') continue;

                    const ts = Number(key);
                    // Filter Redis data by requested time range
                    if (ts >= startDate && ts <= endDate) {
                        try {
                            const parsed = JSON.parse(value);
                            // Ensure structure matches Mongo (Date object for transport_time)
                            parsed.transport_time = new Date(ts);
                            redisData.push(parsed);
                        } catch (e) { /* ignore corrupt */ }
                    }
                }
                return redisData;
            } catch (err) {
                console.error("Redis fetch error in graph:", err);
                return []; // Fail safe, return only Mongo data
            }
        })();

        // 3. Execute in Parallel
        const [mongoData, redisData] = await Promise.all([mongoPromise, redisPromise]);

        // 4. Merge & Deduplicate (Optimized)
        // Map: Timestamp -> Data Point. Redis overwrites Mongo (newer/truer source)
        const mergedMap = new Map();

        // Add Mongo Data
        for (const item of mongoData) {
            const timeKey = item.transport_time.getTime();
            mergedMap.set(timeKey, item);
        }

        // Add/Overlay Redis Data
        for (const item of redisData) {
            const timeKey = item.transport_time.getTime();
            mergedMap.set(timeKey, item);
        }

        // 5. Convert back to array and Sort
        const finalData = Array.from(mergedMap.values()).sort((a, b) =>
            a.transport_time.getTime() - b.transport_time.getTime()
        );

        return finalData;
    }

    /**
     * Setup Guard for Flow Devices
     * Throws an error if device is Flow and requires configuration.
     */
    _checkFlowConfigStatus(device) {
        if (device.model?.toLowerCase() === 'flow' && device.setup?.requires_configuration === true) {
            throw new Error('Device requires configuration. Please complete setup before requesting telemetry.');
        }
    }
}

module.exports = new TelemetryService();
