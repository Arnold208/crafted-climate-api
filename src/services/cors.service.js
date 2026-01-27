const CorsSettings = require('../models/admin/CorsSettings');

/**
 * CORS Service - Manage dynamic CORS configuration
 * SAFETY: Multiple safeguards to prevent accidental lockouts
 */
class CorsService {

    /**
     * Get current CORS settings (with fallback)
     */
    async getCorsSettings() {
        try {
            let settings = await CorsSettings.findOne({ settingId: 'global' });

            // Initialize if doesn't exist
            if (!settings) {
                settings = await this.initializeDefaults();
            }

            return settings;
        } catch (error) {
            console.error('[CorsService] Error fetching settings:', error);
            // SAFETY: Return safe defaults if DB fails
            return this.getFallbackSettings();
        }
    }

    /**
     * Initialize default CORS settings
     */
    async initializeDefaults() {
        const defaultOrigins = process.env.ALLOWED_ORIGINS
            ? process.env.ALLOWED_ORIGINS.split(',')
            : ['http://localhost:3000', 'http://localhost:3001'];

        const settings = new CorsSettings({
            settingId: 'global',
            enabled: true,
            allowedOrigins: defaultOrigins,
            allowCredentials: true,
            updatedBy: 'system',
            useFallback: true
        });

        await settings.save();
        console.log('✅ CORS settings initialized with defaults');
        return settings;
    }

    /**
     * SAFETY: Fallback settings if DB fails
     */
    getFallbackSettings() {
        const fallbackOrigins = process.env.ALLOWED_ORIGINS
            ? process.env.ALLOWED_ORIGINS.split(',')
            : ['http://localhost:3000'];

        return {
            enabled: true,
            allowedOrigins: fallbackOrigins,
            allowCredentials: true,
            useFallback: true
        };
    }

    /**
     * Update CORS settings with validation
     */
    async updateCorsSettings(data, adminId) {
        try {
            const settings = await this.getCorsSettings();

            // SAFETY: Validate origins before applying
            if (data.allowedOrigins) {
                if (!Array.isArray(data.allowedOrigins) || data.allowedOrigins.length === 0) {
                    throw new Error('At least one origin must be allowed to prevent lockout');
                }

                // Validate each origin format
                for (const origin of data.allowedOrigins) {
                    if (!this.isValidOrigin(origin)) {
                        throw new Error(`Invalid origin format: ${origin}`);
                    }
                }
            }

            // Record change in history
            const changeRecord = {
                action: 'UPDATE_SETTINGS',
                performedBy: adminId,
                timestamp: new Date(),
                previousValue: {
                    enabled: settings.enabled,
                    allowedOrigins: settings.allowedOrigins,
                    allowCredentials: settings.allowCredentials
                },
                newValue: data
            };

            settings.changeHistory.push(changeRecord);

            // Apply updates
            if (data.enabled !== undefined) settings.enabled = data.enabled;
            if (data.allowedOrigins) settings.allowedOrigins = data.allowedOrigins;
            if (data.allowCredentials !== undefined) settings.allowCredentials = data.allowCredentials;

            settings.updatedBy = adminId;
            settings.lastUpdatedAt = new Date();

            await settings.save();

            console.log(`✅ CORS settings updated by admin: ${adminId}`);
            return settings;

        } catch (error) {
            console.error('[CorsService] Update failed:', error);
            throw error;
        }
    }

    /**
     * Add a single allowed origin
     */
    async addAllowedOrigin(origin, adminId) {
        if (!this.isValidOrigin(origin)) {
            throw new Error(`Invalid origin format: ${origin}`);
        }

        const settings = await this.getCorsSettings();

        if (settings.allowedOrigins.includes(origin)) {
            throw new Error(`Origin already exists: ${origin}`);
        }

        settings.allowedOrigins.push(origin);
        settings.updatedBy = adminId;
        settings.lastUpdatedAt = new Date();

        settings.changeHistory.push({
            action: 'ADD_ORIGIN',
            performedBy: adminId,
            timestamp: new Date(),
            newValue: origin
        });

        await settings.save();
        console.log(`✅ Added origin: ${origin} by admin: ${adminId}`);
        return settings;
    }

    /**
     * Remove an allowed origin (with safety check)
     */
    async removeAllowedOrigin(origin, adminId) {
        const settings = await this.getCorsSettings();

        // SAFETY: Prevent removing last origin
        if (settings.allowedOrigins.length <= 1) {
            throw new Error('Cannot remove last origin - at least one must remain to prevent lockout');
        }

        const index = settings.allowedOrigins.indexOf(origin);
        if (index === -1) {
            throw new Error(`Origin not found: ${origin}`);
        }

        settings.allowedOrigins.splice(index, 1);
        settings.updatedBy = adminId;
        settings.lastUpdatedAt = new Date();

        settings.changeHistory.push({
            action: 'REMOVE_ORIGIN',
            performedBy: adminId,
            timestamp: new Date(),
            previousValue: origin
        });

        await settings.save();
        console.log(`✅ Removed origin: ${origin} by admin: ${adminId}`);
        return settings;
    }

    /**
     * Toggle CORS enforcement
     */
    async toggleCorsEnforcement(enabled, adminId) {
        const settings = await this.getCorsSettings();

        settings.changeHistory.push({
            action: 'TOGGLE_ENFORCEMENT',
            performedBy: adminId,
            timestamp: new Date(),
            previousValue: settings.enabled,
            newValue: enabled
        });

        settings.enabled = enabled;
        settings.updatedBy = adminId;
        settings.lastUpdatedAt = new Date();

        await settings.save();
        console.log(`✅ CORS enforcement ${enabled ? 'enabled' : 'disabled'} by admin: ${adminId}`);
        return settings;
    }

    /**
     * Validate origin format
     */
    isValidOrigin(origin) {
        // Allow wildcard
        if (origin === '*') return true;

        // Validate URL format
        try {
            const url = new URL(origin);
            return ['http:', 'https:'].includes(url.protocol);
        } catch {
            return false;
        }
    }

    /**
     * Get change history
     */
    async getChangeHistory() {
        const settings = await this.getCorsSettings();
        return settings.changeHistory || [];
    }
}

module.exports = new CorsService();
