const { client: redisClient } = require('../config/redis/redis');

const CACHE_TTL = 3600; // 1 hour

/**
 * Construct the cache key for a device ID
 * @param {string} devid 
 */
const getKey = (devid) => `device:auth:${devid}`;

/**
 * Get cached device metadata
 * @param {string} devid 
 * @returns {Promise<object|null>} Device object or null
 */
async function getDeviceCache(devid) {
    try {
        const key = getKey(devid);
        const data = await redisClient.get(key);
        return data ? JSON.parse(data) : null;
    } catch (err) {
        console.error('Redis cache get error:', err);
        return null; // Fallback to DB on error
    }
}

/**
 * Set device metadata in cache
 * @param {string} devid 
 * @param {object} deviceData - The minimal data needed for telemetry ingestion
 */
async function setDeviceCache(devid, deviceData) {
    try {
        const key = getKey(devid);
        // Store only necessary fields to save memory
        const cacheable = {
            _id: deviceData._id,
            auid: deviceData.auid,
            devid: deviceData.devid,
            userid: deviceData.userid,
            model: deviceData.model,
            datapoints: deviceData.datapoints,
            availability: deviceData.availability
        };
        await redisClient.set(key, JSON.stringify(cacheable), { EX: CACHE_TTL });
    } catch (err) {
        console.error('Redis cache set error:', err);
    }
}

/**
 * Invalidate device cache (call this on update/delete)
 * @param {string} devid 
 */
async function invalidateDeviceCache(devid) {
    try {
        await redisClient.del(getKey(devid));
    } catch (err) {
        console.error('Redis cache del error:', err);
    }
}

module.exports = { getDeviceCache, setDeviceCache, invalidateDeviceCache };
