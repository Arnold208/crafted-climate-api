const { v4: uuidv4 } = require('uuid');
const { writeAuditLog } = require('../config/storage/storage');

/**
 * Manually create an audit log entry
 * Useful for logging actions from services that are not automatically caught by middleware
 */
async function createAuditLog(data) {
    const {
        action,
        userid,
        organizationId,
        details = {},
        ipAddress = 'system',
        platformRole = null,
        route = 'internal',
        method = 'internal',
        statusCode = 200,
        allowed = true
    } = data;

    const timestamp = new Date().toISOString();
    const rowKey = `${timestamp}-${uuidv4()}`;
    const partitionKey = organizationId || 'platform';

    const auditLog = {
        PartitionKey: partitionKey,
        RowKey: rowKey,
        timestamp: new Date(timestamp),
        userid: userid || 'anonymous',
        platformRole: platformRole,
        organizationId: organizationId || null,
        route: route,
        method: method,
        ipAddress: ipAddress,
        requestBody: JSON.stringify({ action, ...details }),
        statusCode: statusCode,
        allowed: allowed,
        meta: JSON.stringify(data.meta || {})
    };

    try {
        await writeAuditLog(auditLog);
    } catch (err) {
        console.error('[createAuditLog] Failed to write log:', err.message);
    }
}

module.exports = { createAuditLog };
