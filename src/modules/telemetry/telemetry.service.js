const { client: redisClient } = require('../../config/redis/redis');
const CacheService = require('../common/cache.service');
const registerNewDevice = require('../../models/devices/registerDevice');
const EnvTelemetry = require('../../models/telemetry/envModel');
const AquaTelemetry = require('../../models/telemetry/aquaModel');
const GasSoloTelemetry = require('../../models/telemetry/gasSoloModel');
const SensorModel = require('../../models/devices/deviceModels');

const { mapTelemetryData } = require('../../utils/telemetryMapper');
const { cacheTelemetryToRedis } = require('../../utils/redisTelemetry');
const { calculateAQI } = require('../../utils/aqiFunction');
const { getDeviceCache, setDeviceCache } = require('../../utils/deviceCache');

const MODEL_MAP = {
    env: EnvTelemetry,
    aqua: AquaTelemetry,
    'gas-solo': GasSoloTelemetry,
    'gassolo': GasSoloTelemetry // Alias for safety
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
    // Alias to match the above array reference if needed, but robust lookup is better
};
CSV_COLUMNS.gassolo = CSV_COLUMNS['gas-solo'];

class TelemetryService {

    _resolveModelKey(model) {
        const m = model.toLowerCase();
        if (m === 'gassolo' || m === 'gas-solo') return 'gas-solo';
        return m;
    }

    /**
     * Ingest telemetry data
     */
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

        return { success: true };
    }

    /**
     * Get Telemetry (Redis -> Mongo Fallback)
     */
    async getDeviceTelemetry(userid, auid, limit = 50, orgRole = null) {
        // 1. Check Access
        const device = await registerNewDevice.findOne({ auid });
        if (!device) {
            throw new Error('Device not found'); // 404
        }

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

            return {
                source: 'redis',
                metadata,
                count: telemetryData.length,
                telemetry: telemetryData
            };
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
        const devices = await registerNewDevice.find(query, { auid: 1 }).skip(skip).limit(limit).lean();

        const result = await Promise.all(
            devices.map(async ({ auid }) => {
                try {
                    const all = await redisClient.hGetAll(auid);
                    if (!all || Object.keys(all).length === 0) return null;

                    const metadata = all.metadata ? JSON.parse(all.metadata) : null;
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

        const data = await M.find(query).limit(limit).lean();
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
}

module.exports = new TelemetryService();
