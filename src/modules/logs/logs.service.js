const { tableClient } = require('../../config/storage/storage');

class LogsService {
    async queryLogs(filter, { limit, offset }) {
        const logs = [];
        let totalCount = 0;

        try {
            const entities = tableClient.listEntities({ filter });

            for await (const entity of entities) {
                totalCount++;
                if (totalCount > offset && logs.length < limit) {
                    logs.push(entity);
                }
                if (totalCount > offset + limit + 1000) break; // Safety limit
            }

            return {
                logs,
                total: totalCount,
                limit,
                offset,
                hasMore: totalCount > offset + limit,
                timestamp: new Date().toISOString()
            };
        } catch (err) {
            throw new Error(`Failed to query logs: ${err.message}`);
        }
    }

    buildTimeFilter(baseFilters, startTime, endTime) {
        if (startTime) {
            const startISO = new Date(startTime).toISOString();
            baseFilters.push(`timestamp ge datetime'${startISO}'`);
        }
        if (endTime) {
            const endISO = new Date(endTime).toISOString();
            baseFilters.push(`timestamp le datetime'${endISO}'`);
        }
        return baseFilters.join(' and ');
    }
}

module.exports = new LogsService();
