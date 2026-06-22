const rateLimit = require('express-rate-limit');

/**
 * API Key Rate Limiter
 * Enforces per-key rate limits.
 *
 * Caches limiter instances by keyId to avoid the express-rate-limit
 * anti-pattern of creating a new limiter (and resetting the in-memory store)
 * on every request.
 *
 * For partner keys: respects req.apiKeyRateLimitMultiplier set by
 * authenticateApiKey.js from the org's partnerStatus.benefits.apiRateLimitMultiplier.
 */

// In-process limiter cache: keyId → rateLimit instance
const _limiterCache = new Map();

const apiKeyRateLimiter = async (req, res, next) => {
    if (!req.apiKey) return next();

    const { keyId, rateLimit: keyRateLimit } = req.apiKey;
    let { requests, windowMs } = keyRateLimit;

    // Apply partner rate limit multiplier (set by authenticateApiKey for partner keys)
    const multiplier = req.apiKeyRateLimitMultiplier || 1;
    const effectiveMax = Math.floor(requests * multiplier);

    // Cache key: keyId + effective limit (if multiplier changes, re-create)
    const cacheKey = `${keyId}:${effectiveMax}:${windowMs}`;

    if (!_limiterCache.has(cacheKey)) {
        const limiter = rateLimit({
            windowMs,
            max: effectiveMax,
            keyGenerator: () => keyId,
            handler: (_req, _res) => {
                _res.status(429).json({
                    success: false,
                    message: `Rate limit exceeded. Max ${effectiveMax} requests per ${windowMs / 1000} seconds.`,
                    retryAfter: Math.ceil(windowMs / 1000)
                });
            },
            standardHeaders: true,
            legacyHeaders: false,
            // Skip counting failed auth requests
            skip: (_req) => false,
        });
        _limiterCache.set(cacheKey, limiter);
    }

    return _limiterCache.get(cacheKey)(req, res, next);
};

module.exports = apiKeyRateLimiter;
