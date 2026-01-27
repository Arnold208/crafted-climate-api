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

        // Attach to request
        req.apiKey = validKey;
        req.organizationId = validKey.organizationId;
        req.authType = 'api_key';

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
            } catch (error) {
                console.error('Failed to track API key usage:', error);
            }
        });

        next();
    } catch (error) {
        console.error('[API Key Auth] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication error'
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
        if (!req.apiKey) {
            return res.status(401).json({
                success: false,
                message: 'API key authentication required'
            });
        }

        if (!req.apiKey.permissions.includes(permission)) {
            return res.status(403).json({
                success: false,
                message: `Permission denied. Required: ${permission}`
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
