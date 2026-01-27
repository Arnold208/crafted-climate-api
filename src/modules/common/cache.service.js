const { client } = require('../../config/redis/redis');

/**
 * CacheService
 * Wrapper for Redis to handle caching with fail-safe database fallback.
 */
class CacheService {

    /**
     * Get value from cache, or fetch from DB and set in cache if missing.
     * @param {string} key - Redis key
     * @param {Function} fetcher - Async function to fetch data from DB if cache miss
     * @param {number} ttlSeconds - Time to live in seconds (default 3600 = 1hr)
     * @returns {Promise<any>} - The data
     */
    async getOrSet(key, fetcher, ttlSeconds = 3600) {
        if (!client.isOpen) {
            console.warn(`[CacheService] Redis offline, bypassing cache for key: ${key}`);
            return await fetcher();
        }

        try {
            const cachedData = await client.get(key);
            if (cachedData) {
                // console.log(`[CacheService] HIT: ${key}`);
                return JSON.parse(cachedData);
            }

            // console.log(`[CacheService] MISS: ${key}`);
            const freshData = await fetcher();

            if (freshData !== undefined && freshData !== null) {
                await client.setEx(key, ttlSeconds, JSON.stringify(freshData));
            }

            return freshData;
        } catch (error) {
            console.error(`[CacheService] Error on key ${key}:`, error);
            // Fail-safe: return fresh data if redis fails
            return await fetcher();
        }
    }

    /**
     * Invalidate a specific key
     * @param {string} key 
     */
    async invalidate(key) {
        if (!client.isOpen) return;
        try {
            await client.del(key);
            // console.log(`[CacheService] Invalidated: ${key}`);
        } catch (error) {
            console.error(`[CacheService] Invalidate Error ${key}:`, error);
        }
    }

    /**
     * Invalidate multiple keys by pattern
     * Use sparingly - SCAN is expensive in large DBs, but okay for targeted cleanup
     * @param {string} pattern - e.g. "org:123:*"
     */
    async invalidatePattern(pattern) {
        if (!client.isOpen) return;
        try {
            const keys = await client.keys(pattern); // Note: explicit KEYS command for simplicity in small-medium ops. SCAN is better for massive scale.
            if (keys.length > 0) {
                await client.del(keys);
                console.log(`[CacheService] Invalidated Pattern ${pattern}: ${keys.length} keys removed`);
            }
        } catch (error) {
            console.error(`[CacheService] InvalidatePattern Error ${pattern}:`, error);
        }
    }
}

module.exports = new CacheService();
