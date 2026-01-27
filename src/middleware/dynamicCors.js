const corsService = require('../services/cors.service');

/**
 * Dynamic CORS Middleware with Database Configuration
 * SAFETY: Falls back to env vars if DB fails
 */

// Cache to avoid DB hit on every request
let corsCache = null;
let cacheExpiry = 0;
const CACHE_TTL = 60000; // 1 minute

async function getDynamicCorsOptions() {
    const now = Date.now();

    // Return cached settings if still valid
    if (corsCache && now < cacheExpiry) {
        return corsCache;
    }

    try {
        const settings = await corsService.getCorsSettings();

        corsCache = {
            origin: function (origin, callback) {
                // If CORS is disabled, allow all
                if (!settings.enabled) {
                    return callback(null, true);
                }

                // Allow requests with no origin (mobile apps, Postman, server-to-server)
                if (!origin) {
                    return callback(null, true);
                }

                // Check if origin is in allowed list
                if (settings.allowedOrigins.includes(origin) || settings.allowedOrigins.includes('*')) {
                    callback(null, true);
                } else {
                    callback(new Error(`CORS: Origin ${origin} not allowed`));
                }
            },
            credentials: settings.allowCredentials,
            optionsSuccessStatus: 200
        };

        cacheExpiry = now + CACHE_TTL;
        return corsCache;

    } catch (error) {
        console.error('[DynamicCORS] Error fetching settings, using fallback:', error);

        // SAFETY: Fallback to environment variables
        const fallbackOrigins = process.env.ALLOWED_ORIGINS
            ? process.env.ALLOWED_ORIGINS.split(',')
            : ['http://localhost:3000'];

        return {
            origin: function (origin, callback) {
                if (!origin || fallbackOrigins.includes(origin) || fallbackOrigins.includes('*')) {
                    callback(null, true);
                } else {
                    callback(new Error('CORS: Origin not allowed'));
                }
            },
            credentials: true,
            optionsSuccessStatus: 200
        };
    }
}

/**
 * Express middleware wrapper
 */
async function dynamicCorsMiddleware(req, res, next) {
    const cors = require('cors');
    const corsOptions = await getDynamicCorsOptions();
    cors(corsOptions)(req, res, next);
}

/**
 * Clear cache (useful after updating settings)
 */
function clearCorsCache() {
    corsCache = null;
    cacheExpiry = 0;
    console.log('✅ CORS cache cleared');
}

module.exports = {
    dynamicCorsMiddleware,
    clearCorsCache
};
