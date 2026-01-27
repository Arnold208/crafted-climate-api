const { tableClient } = require('../config/storage/storage');

/**
 * Admin Audit Log Service
 * Query and export audit logs from Azure Table Storage
 */
class AdminAuditService {

    /**
     * Get all audit logs with filters
     */
    async getAllLogs(filters = {}, pagination = {}) {
        const {
            action,
            userid,
            organizationId,
            startDate,
            endDate,
            statusCode,
            allowed
        } = filters;

        const {
            limit = 100
        } = pagination;

        try {
            const queryOptions = {
                filter: this._buildFilterString(filters)
            };

            const entities = tableClient.listEntities({
                queryOptions
            });

            const logs = [];
            let count = 0;

            // Note: Data Tables doesn't support offset-based pagination well
            // We use a simple limit for now
            for await (const entity of entities) {
                logs.push(this._formatLog(entity));
                count++;
                if (count >= limit) break;
            }

            return {
                logs,
                pagination: {
                    limit,
                    total: logs.length, // Approximate if we hit limit
                    pages: 1
                }
            };
        } catch (error) {
            console.error('[AdminAuditService] GetLogs error:', error.message);
            throw new Error(`Failed to retrieve audit logs: ${error.message}`);
        }
    }

    /**
     * Get user-specific logs
     */
    async getUserLogs(userid, dateRange = {}) {
        return this.getAllLogs({ userid, ...dateRange });
    }

    /**
     * Get organization-specific logs
     */
    async getOrganizationLogs(organizationId, dateRange = {}) {
        return this.getAllLogs({ organizationId, ...dateRange });
    }

    /**
     * Export logs to CSV/JSON
     */
    async exportLogs(filters = {}, format = 'json') {
        const { logs } = await this.getAllLogs(filters, { limit: 1000 });

        if (format === 'json') {
            return {
                format: 'json',
                data: logs,
                filename: `audit_logs_${Date.now()}.json`
            };
        }

        // Simple CSV conversion
        const headers = ['Timestamp', 'User', 'Action', 'Target', 'Status', 'IP'];
        const rows = logs.map(l => [
            l.timestamp,
            l.userid,
            l.method + ' ' + l.route,
            l.organizationId || 'platform',
            l.statusCode,
            l.ipAddress
        ].join(','));

        const csvContent = [headers.join(','), ...rows].join('\n');

        return {
            format: 'csv',
            data: csvContent,
            filename: `audit_logs_${Date.now()}.csv`
        };
    }

    /**
     * Get audit statistics
     */
    async getAuditStatistics(dateRange = {}) {
        const { logs } = await this.getAllLogs(dateRange, { limit: 1000 });

        const stats = {
            totalLogs: logs.length,
            byMethod: {},
            byStatus: {},
            topUsers: {}
        };

        logs.forEach(log => {
            // By Method
            stats.byMethod[log.method] = (stats.byMethod[log.method] || 0) + 1;

            // By Status
            const statusGroup = Math.floor(log.statusCode / 100) + 'xx';
            stats.byStatus[statusGroup] = (stats.byStatus[statusGroup] || 0) + 1;

            // Top Users
            stats.topUsers[log.userid] = (stats.topUsers[log.userid] || 0) + 1;
        });

        return stats;
    }

    /**
     * Build OData filter string for Azure Table Storage
     */
    _buildFilterString(filters) {
        const parts = [];

        if (filters.userid) {
            parts.push(`userid eq '${filters.userid}'`);
        }

        if (filters.organizationId) {
            parts.push(`PartitionKey eq '${filters.organizationId}'`);
        }

        if (filters.startDate) {
            parts.push(`Timestamp ge datetime'${new Date(filters.startDate).toISOString()}'`);
        }

        if (filters.endDate) {
            parts.push(`Timestamp le datetime'${new Date(filters.endDate).toISOString()}'`);
        }

        if (filters.statusCode) {
            parts.push(`statusCode eq ${filters.statusCode}`);
        }

        if (filters.allowed !== undefined) {
            parts.push(`allowed eq ${filters.allowed}`);
        }

        return parts.length > 0 ? parts.join(' and ') : undefined;
    }

    /**
     * Format entity back to clean JSON
     */
    _formatLog(entity) {
        return {
            id: entity.RowKey,
            timestamp: entity.timestamp,
            userid: entity.userid,
            organizationId: entity.organizationId,
            route: entity.route,
            method: entity.method,
            statusCode: entity.statusCode,
            allowed: entity.allowed,
            ipAddress: entity.ipAddress,
            requestBody: entity.requestBody ? JSON.parse(entity.requestBody) : null,
            meta: entity.meta ? JSON.parse(entity.meta) : null
        };
    }
}

module.exports = new AdminAuditService();
