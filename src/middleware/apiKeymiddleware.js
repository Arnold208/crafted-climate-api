'use strict';

/**
 * Manufacturer API Key Middleware
 * ================================
 * PURPOSE: Machine-to-machine auth for the hardware MANUFACTURER only.
 *          Used when factory systems push newly provisioned devices into the platform.
 *
 * THIS IS NOT THE ORG API KEY SYSTEM.
 * Org API keys use: src/middleware/authenticateApiKey.js (bcrypt-hashed, DB-stored, scoped)
 * This key is a single static secret shared only with the device manufacturer.
 *
 * Env variable: MANUFACTURER_API_KEY
 * Legacy fallback: API_KEY (for backward compat during transition — remove after all envs updated)
 *
 * Routes using this: manufacturer.routes.js, ota.routes.js, sensorModel.routes.js
 */

function verifyManufacturerApiKey(req, res, next) {
    const incomingKey = req.headers['x-api-key'];

    // Prefer the explicit MANUFACTURER_API_KEY, fall back to legacy API_KEY
    const validKey = process.env.MANUFACTURER_API_KEY || process.env.API_KEY;

    if (!validKey) {
        console.error('[ManufacturerAuth] ❌ MANUFACTURER_API_KEY env var is not set.');
        return res.status(500).json({ error: 'Server misconfiguration: manufacturer key not configured.' });
    }

    if (!incomingKey) {
        return res.status(401).json({ error: 'Manufacturer API key missing. Provide key in X-API-Key header.' });
    }

    if (incomingKey !== validKey) {
        return res.status(403).json({ error: 'Invalid manufacturer API key.' });
    }

    next();
}

module.exports = verifyManufacturerApiKey;
