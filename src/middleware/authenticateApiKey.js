const apiKeyService = require('../services/apiKey.service');

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
