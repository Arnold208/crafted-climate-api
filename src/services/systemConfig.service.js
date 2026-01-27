const SystemConfig = require('../models/admin/SystemConfig');
const { createAuditLog } = require('../utils/auditLogger');

/**
 * System Configuration Service
 * Manage platform-wide settings
 */
class SystemConfigService {

    /**
     * Get system configuration
     */
    async getConfig() {
        let config = await SystemConfig.findOne({ configId: 'global' });

        if (!config) {
            config = await this.initializeDefaults();
        }

        return config;
    }

    /**
     * Initialize default configuration
     */
    async initializeDefaults() {
        const config = new SystemConfig({
            configId: 'global',
            updatedBy: 'system'
        });

        await config.save();
        console.log('✅ System configuration initialized');
        return config;
    }

    /**
     * Update feature flags
     */
    async updateFeatures(features, adminId) {
        const config = await this.getConfig();
        const oldFeatures = { ...config.features };

        Object.keys(features).forEach(key => {
            if (config.features[key] !== undefined) {
                config.features[key] = features[key];

                config.changeHistory.push({
                    field: `features.${key}`,
                    oldValue: oldFeatures[key],
                    newValue: features[key],
                    changedBy: adminId
                });
            }
        });

        config.updatedBy = adminId;
        config.lastUpdatedAt = new Date();
        await config.save();

        // Audit log
        await createAuditLog({
            action: 'ADMIN_UPDATE_FEATURE_FLAGS',
            userid: adminId,
            details: { oldFeatures, newFeatures: features },
            ipAddress: null
        });

        return config;
    }

    /**
     * Update rate limits
     */
    async updateRateLimits(rateLimits, adminId) {
        const config = await this.getConfig();
        const oldLimits = { ...config.rateLimits };

        Object.keys(rateLimits).forEach(key => {
            if (config.rateLimits[key]) {
                config.rateLimits[key] = {
                    ...config.rateLimits[key],
                    ...rateLimits[key]
                };

                config.changeHistory.push({
                    field: `rateLimits.${key}`,
                    oldValue: oldLimits[key],
                    newValue: config.rateLimits[key],
                    changedBy: adminId
                });
            }
        });

        config.updatedBy = adminId;
        config.lastUpdatedAt = new Date();
        await config.save();

        // Audit log
        await createAuditLog({
            action: 'ADMIN_UPDATE_RATE_LIMITS',
            userid: adminId,
            details: { oldLimits, newLimits: rateLimits },
            ipAddress: null
        });

        return config;
    }

    /**
     * Toggle maintenance mode
     */
    async toggleMaintenance(enabled, message, adminId) {
        const config = await this.getConfig();

        config.maintenance.enabled = enabled;
        if (message) {
            config.maintenance.message = message;
        }

        config.updatedBy = adminId;
        config.lastUpdatedAt = new Date();

        config.changeHistory.push({
            field: 'maintenance.enabled',
            oldValue: !enabled,
            newValue: enabled,
            changedBy: adminId
        });

        await config.save();

        // Audit log
        await createAuditLog({
            action: 'ADMIN_TOGGLE_MAINTENANCE',
            userid: adminId,
            details: { enabled, message },
            ipAddress: null
        });

        return config;
    }

    /**
     * Get change history
     */
    async getChangeHistory() {
        const config = await this.getConfig();
        return config.changeHistory || [];
    }
}

module.exports = new SystemConfigService();
