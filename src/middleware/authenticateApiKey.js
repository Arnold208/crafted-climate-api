const apiKeyService = require('../services/apiKey.service');
const { client: redis } = require('../config/redis/redis');

/**
 * Fetch org security settings (allowedOrigins + allowedIPs) from Redis cache.
 * Falls back to MongoDB on cache miss. Fails open on any error (Redis down = allow all).
 * Cache TTL: 5 minutes. Invalidated by orgSecurity.controller.js on every write.
 */
async function getOrgSecurity(organizationId) {
    const cacheKey = `org:security:${organizationId}`;
    try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);

        const Organization = require('../models/organization/organizationModel');
        const org = await Organization.findOne({ organizationId }, 'security').lean();
        const security = {
            allowedOrigins: org?.security?.allowedOrigins || [],
            allowedIPs:     org?.security?.allowedIPs     || [],
        };
        // Cache for 5 minutes
        await redis.setEx(cacheKey, 300, JSON.stringify(security));
        return security;
    } catch (_) {
        // Fail open — don't block requests if Redis/DB is temporarily unavailable
        return { allowedOrigins: [], allowedIPs: [] };
    }
}

/**
 * API Key Authentication Middleware
 * Verifies API key and attaches organization context
 */
async function authenticateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({
            success: false,
            message: 'API key required. Provide key in X-API-Key header.'
        });
    }

    try {
        const startTime = Date.now();
        const validKey = await apiKeyService.verifyApiKey(apiKey);

        if (!validKey) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired API key'
            });
        }

        // Check IP whitelist if configured
        if (validKey.allowedIPs && validKey.allowedIPs.length > 0) {
            const clientIP = req.ip || req.connection.remoteAddress;
            if (!validKey.allowedIPs.includes(clientIP)) {
                return res.status(403).json({
                    success: false,
                    message: 'IP address not whitelisted for this API key'
                });
            }
        }

        // Enforce Subscription API Gating
        const getUserPlan = require('./subscriptions/getUserPlan');
        const { plan, sub } = await getUserPlan(validKey.createdBy, validKey.organizationId);
        
        if (plan.features.apiAccess === 'none') {
            return res.status(403).json({
                success: false,
                message: 'API access is not included in your current subscription plan.'
            });
        }

        if (plan.features.apiAccess === 'limited') {
            const maxCalls = plan.features.maxApiCallsPerMonth || 1000;
            if (sub.usage && sub.usage.apiCallsThisMonth >= maxCalls) {
                return res.status(429).json({
                    success: false,
                    message: 'Monthly API call limit reached for your plan.'
                });
            }
        }

        // ── Per-key rate limiting (Redis sliding window) ───────────────────────
        // Uses INCR + EXPIRE on first hit per window. Reads rateLimit from the key.
        // Fails open on Redis errors so a Redis blip never takes down the API.
        try {
            const rlKey = `api:ratelimit:${validKey.keyId}`;
            const maxReq = validKey.rateLimit?.requests  || 1000;
            const winMs  = validKey.rateLimit?.windowMs  || 3600000; // 1 hr
            const winSec = Math.floor(winMs / 1000);

            const count = await redis.incr(rlKey);
            if (count === 1) await redis.expire(rlKey, winSec); // set TTL on first hit

            if (count > maxReq) {
                const ttl = await redis.ttl(rlKey);
                return res.status(429).json({
                    success: false,
                    message: `Rate limit exceeded. This key allows ${maxReq} requests per ${Math.round(winSec / 3600)}h window.`,
                    retryAfterSeconds: ttl > 0 ? ttl : winSec
                });
            }
        } catch (_) { /* fail open — rate limiter Redis error is non-fatal */ }

        // ── Org-level security: origin + IP allowlist (Redis-cached) ──────────
        // Empty list = allow all. Checked only for API key requests (not JWT).
        // Cache invalidated instantly when org updates their security settings.
        const orgSecurity = await getOrgSecurity(validKey.organizationId);

        if (orgSecurity.allowedOrigins.length > 0) {
            const origin = req.headers.origin || req.headers.referer || '';
            // Match if origin starts with any whitelisted entry (handles paths under the origin)
            const allowed = orgSecurity.allowedOrigins.some(o => origin.startsWith(o));
            if (!allowed) {
                return res.status(403).json({
                    success: false,
                    message: 'Request origin is not whitelisted for this organization. Add it in your org security settings.'
                });
            }
        }

        if (orgSecurity.allowedIPs.length > 0) {
            const clientIP = (req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress || '')
                .split(',')[0].trim(); // x-forwarded-for may have a chain — take the first (real client IP)
            if (!orgSecurity.allowedIPs.includes(clientIP)) {
                return res.status(403).json({
                    success: false,
                    message: 'Request IP is not whitelisted for this organization. Add it in your org security settings.',
                    clientIP // shown so the org admin knows which IP to add
                });
            }
        }

        // Attach to request
        req.apiKey = validKey;
        req.organizationId = validKey.organizationId;
        req.currentOrgId = validKey.organizationId; // for verifyOrgMembership compatibility
        req.authType = 'api_key';

        // For partner keys: apply the org's apiRateLimitMultiplier benefit
        if (validKey.keyType === 'partner') {
            try {
                const Organization = require('../models/organization/organizationModel');
                const org = await Organization.findOne({ organizationId: validKey.organizationId }).lean();
                const multiplier = org?.partnerStatus?.benefits?.apiRateLimitMultiplier || 1;
                if (multiplier > 1) {
                    // Attach multiplier so apiKeyRateLimiter can use it
                    req.apiKeyRateLimitMultiplier = multiplier;
                }
                // Also attach partner tier for downstream use
                req.partnerTier = org?.partnerStatus?.tier || 'standard';
            } catch (_) { /* non-fatal — multiplier defaults to 1 */ }
        }

        // Mock req.user for downstream tenant check & collaborator middlewares compatibility
        req.user = {
            userid: validKey.createdBy,
            organization: [validKey.organizationId],
            currentOrganizationId: validKey.organizationId,
            platformRole: 'user',
            role: 'user'
        };

        // Track usage on response
        res.on('finish', async () => {
            const responseTime = Date.now() - startTime;
            try {
                await apiKeyService.trackUsage(
                    validKey.keyId,
                    validKey.organizationId,
                    req,
                    res.statusCode,
                    responseTime
                );

                // Increment API usage counter on successful requests
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    const UserSubscription = require('../models/subscriptions/UserSubscription');
                    await UserSubscription.updateOne(
                        { organizationId: validKey.organizationId, status: 'active' },
                        { $inc: { 'usage.apiCallsThisMonth': 1 } }
                    );
                }
            } catch (error) {
                console.error('Failed to track API key usage:', error);
            }
        });

        next();
    } catch (error) {
        console.error('[API Key Auth] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication error',
            error: error.message
        });
    }
}

/**
 * Optional: Allow both JWT and API key authentication
 */
function authenticateApiKeyOrToken(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    const authenticateToken = require('./bearermiddleware');

    if (apiKey) {
        return authenticateApiKey(req, res, next);
    }

    // Fall back to JWT
    return authenticateToken(req, res, next);
}

/**
 * Check API key permissions
 */
function requirePermission(permission) {
    return (req, res, next) => {
        // JWT users (req.user set by bearermiddleware) bypass scope checks — internal users have full access
        if (!req.apiKey && req.user && req.authType !== 'api_key') return next();

        if (!req.apiKey) {
            return res.status(401).json({
                success: false,
                message: 'API key authentication required. Provide key in X-API-Key header.'
            });
        }

        if (!req.apiKey.permissions.includes(permission)) {
            return res.status(403).json({
                success: false,
                message: `Scope denied. This API key requires the '${permission}' scope to access this resource.`,
                requiredScope: permission,
                grantedScopes: req.apiKey.permissions
            });
        }

        next();
    };
}

module.exports = {
    authenticateApiKey,
    authenticateApiKeyOrToken,
    requirePermission
};
