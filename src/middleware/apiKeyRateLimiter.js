const rateLimit = require('express-rate-limit');
const ApiKey = require('../models/apikey/ApiKey');

/**
 * API Key Rate Limiter
 * Enforces per-key rate limits
 */
const apiKeyRateLimiter = async (req, res, next) => {
    if (!req.apiKey) {
        return next();
    }

    const { keyId, rateLimit: keyRateLimit } = req.apiKey;
    const { requests, windowMs } = keyRateLimit;

    // Create dynamic rate limiter for this key
    const limiter = rateLimit({
        windowMs,
        max: requests,
        keyGenerator: () => keyId,
        handler: (req, res) => {
            res.status(429).json({
                success: false,
                message: `Rate limit exceeded. Max ${requests} requests per ${windowMs / 1000} seconds.`,
                retryAfter: Math.ceil(windowMs / 1000)
            });
        },
        standardHeaders: true,
        legacyHeaders: false
    });

    return limiter(req, res, next);
};

module.exports = apiKeyRateLimiter;
