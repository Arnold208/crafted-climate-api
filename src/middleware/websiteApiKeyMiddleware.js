'use strict';

/**
 * Website API Key Middleware
 * ==========================
 * PURPOSE: Authenticate requests originating from the public website forms.
 *          Verifies the static token passed in the 'x-api-key' header.
 *
 * Env variable: WEBSITE_API_KEY
 */
function verifyWebsiteApiKey(req, res, next) {
    const incomingKey = req.headers['x-api-key'];
    const validKey = process.env.WEBSITE_API_KEY || 'cc_web_secure_secret_api_key_2026_q2_afri';

    if (!incomingKey) {
        return res.status(401).json({ 
            success: false, 
            message: 'Website API key missing. Provide key in X-API-Key header.' 
        });
    }

    if (incomingKey !== validKey) {
        return res.status(403).json({ 
            success: false, 
            message: 'Invalid website API key.' 
        });
    }

    next();
}

module.exports = verifyWebsiteApiKey;
