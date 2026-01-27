const ApiKey = require('../models/apikey/ApiKey');
const ApiKeyUsage = require('../models/apikey/ApiKeyUsage');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { createAuditLog } = require('../utils/auditLogger');

/**
 * API Key Service
 * Secure API key lifecycle management
 */
class ApiKeyService {

    /**
     * Generate new API key
     */
    async generateApiKey(organizationId, data, createdBy) {
        const { name, permissions, rateLimit, expiresAt, rotationSchedule, allowedIPs } = data;

        // Generate secure random key
        const rawKey = crypto.randomBytes(32).toString('hex'); // 64 characters
        const keyPrefix = ApiKey.generatePrefix('live');
        const fullKey = `${keyPrefix}_${rawKey}`;

        // Hash the key for storage
        const keyHash = await bcrypt.hash(fullKey, 12);

        const apiKey = new ApiKey({
            keyId: uuidv4(),
            organizationId,
            name,
            keyHash,
            keyPrefix,
            permissions: permissions || ['telemetry:read', 'devices:read'],
            rateLimit: rateLimit || { requests: 1000, windowMs: 3600000 },
            expiresAt,
            rotationSchedule: rotationSchedule || 'none',
            nextRotationDate: this._calculateNextRotation(rotationSchedule),
            allowedIPs,
            createdBy
        });

        await apiKey.save();

        // Audit log
        await createAuditLog({
            action: 'API_KEY_GENERATED',
            userid: createdBy,
            organizationId,
            details: { keyId: apiKey.keyId, name, permissions },
            ipAddress: null
        });

        // Return the full key ONLY ONCE (never stored)
        return {
            keyId: apiKey.keyId,
            key: fullKey, // ONLY TIME this is visible
            keyPrefix: apiKey.keyPrefix,
            name: apiKey.name,
            permissions: apiKey.permissions,
            expiresAt: apiKey.expiresAt,
            message: 'IMPORTANT: Save this key securely. It will not be shown again.'
        };
    }

    /**
     * Rotate API key
     */
    async rotateApiKey(keyId, userid) {
        const existingKey = await ApiKey.findOne({ keyId });
        if (!existingKey) {
            throw new Error('API key not found');
        }

        if (existingKey.status !== 'active') {
            throw new Error('Cannot rotate inactive key');
        }

        // Generate new key
        const rawKey = crypto.randomBytes(32).toString('hex');
        const keyPrefix = ApiKey.generatePrefix('live');
        const fullKey = `${keyPrefix}_${rawKey}`;
        const keyHash = await bcrypt.hash(fullKey, 12);

        // Update existing key
        existingKey.keyHash = keyHash;
        existingKey.keyPrefix = keyPrefix;
        existingKey.nextRotationDate = this._calculateNextRotation(existingKey.rotationSchedule);
        await existingKey.save();

        // Audit log
        await createAuditLog({
            action: 'API_KEY_ROTATED',
            userid,
            organizationId: existingKey.organizationId,
            details: { keyId, oldPrefix: existingKey.keyPrefix, newPrefix: keyPrefix },
            ipAddress: null
        });

        return {
            keyId: existingKey.keyId,
            key: fullKey,
            keyPrefix: existingKey.keyPrefix,
            message: 'Key rotated successfully. Update your applications with the new key.'
        };
    }

    /**
     * Revoke API key
     */
    async revokeApiKey(keyId, reason, revokedBy) {
        const apiKey = await ApiKey.findOne({ keyId });
        if (!apiKey) {
            throw new Error('API key not found');
        }

        apiKey.status = 'revoked';
        apiKey.revokedBy = revokedBy;
        apiKey.revokedAt = new Date();
        apiKey.revokedReason = reason;
        await apiKey.save();

        // Audit log
        await createAuditLog({
            action: 'API_KEY_REVOKED',
            userid: revokedBy,
            organizationId: apiKey.organizationId,
            details: { keyId, reason },
            ipAddress: null
        });

        return { success: true, message: 'API key revoked successfully' };
    }

    /**
     * Suspend API key
     */
    async suspendApiKey(keyId, userid) {
        const apiKey = await ApiKey.findOne({ keyId });
        if (!apiKey) {
            throw new Error('API key not found');
        }

        apiKey.status = 'suspended';
        await apiKey.save();

        // Audit log
        await createAuditLog({
            action: 'API_KEY_SUSPENDED',
            userid,
            organizationId: apiKey.organizationId,
            details: { keyId },
            ipAddress: null
        });

        return { success: true, message: 'API key suspended successfully' };
    }

    /**
     * Restore suspended API key
     */
    async restoreApiKey(keyId, userid) {
        const apiKey = await ApiKey.findOne({ keyId });
        if (!apiKey) {
            throw new Error('API key not found');
        }

        if (apiKey.status !== 'suspended') {
            throw new Error('Only suspended keys can be restored');
        }

        apiKey.status = 'active';
        await apiKey.save();

        // Audit log
        await createAuditLog({
            action: 'API_KEY_RESTORED',
            userid,
            organizationId: apiKey.organizationId,
            details: { keyId },
            ipAddress: null
        });

        return { success: true, message: 'API key restored successfully' };
    }

    /**
     * Verify API key
     */
    async verifyApiKey(providedKey) {
        // Extract prefix
        const parts = providedKey.split('_');
        if (parts.length < 3) {
            return null;
        }

        const keyPrefix = `${parts[0]}_${parts[1]}_${parts[2]}`;

        // Find key by prefix
        const apiKey = await ApiKey.findOne({ keyPrefix, status: 'active' });
        if (!apiKey) {
            return null;
        }

        // Verify hash
        const isValid = await bcrypt.compare(providedKey, apiKey.keyHash);
        if (!isValid) {
            return null;
        }

        // Check expiration
        if (!apiKey.isValid()) {
            return null;
        }

        // Update last used
        apiKey.lastUsedAt = new Date();
        apiKey.usageCount += 1;
        await apiKey.save();

        return apiKey;
    }

    /**
     * Track API key usage
     */
    async trackUsage(keyId, organizationId, req, statusCode, responseTime) {
        const usage = new ApiKeyUsage({
            keyId,
            organizationId,
            endpoint: req.path,
            method: req.method,
            statusCode,
            responseTime,
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });

        await usage.save();
    }

    /**
     * Get API key usage statistics
     */
    async getUsageStats(keyId, dateRange = {}) {
        const { startDate, endDate } = dateRange;

        const query = { keyId };
        if (startDate && endDate) {
            query.timestamp = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const [totalRequests, byEndpoint, byStatus] = await Promise.all([
            ApiKeyUsage.countDocuments(query),
            ApiKeyUsage.aggregate([
                { $match: query },
                { $group: { _id: '$endpoint', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]),
            ApiKeyUsage.aggregate([
                { $match: query },
                { $group: { _id: '$statusCode', count: { $sum: 1 } } }
            ])
        ]);

        return {
            totalRequests,
            topEndpoints: byEndpoint,
            statusCodeDistribution: byStatus,
            dateRange
        };
    }

    /**
     * List API keys for organization
     */
    async listApiKeys(organizationId, filters = {}) {
        const { status } = filters;

        const query = { organizationId };
        if (status) {
            query.status = status;
        }

        const keys = await ApiKey.find(query)
            .select('-keyHash')
            .sort({ createdAt: -1 })
            .lean();

        return keys;
    }

    /**
     * Calculate next rotation date
     */
    _calculateNextRotation(schedule) {
        if (!schedule || schedule === 'none') return null;

        const now = new Date();
        switch (schedule) {
            case 'monthly':
                return new Date(now.setMonth(now.getMonth() + 1));
            case 'quarterly':
                return new Date(now.setMonth(now.getMonth() + 3));
            case 'yearly':
                return new Date(now.setFullYear(now.getFullYear() + 1));
            default:
                return null;
        }
    }
}

module.exports = new ApiKeyService();
