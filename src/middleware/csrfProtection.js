/**
 * CSRF Protection Middleware
 * Protects against Cross-Site Request Forgery attacks
 * 
 * 🔒 SECURITY: Validates CSRF tokens on mutation requests
 */

const crypto = require('crypto');
const { client: redis } = require('../config/redis/redis');

// Token expiry time (15 minutes)
const TOKEN_EXPIRY_SECONDS = 15 * 60;

/**
 * Generate CSRF token for a user session
 */
async function generateCsrfToken(userid) {
    const token = crypto.randomBytes(32).toString('hex');
    const key = `csrf:token:${token}`;

    // Store in Redis with TTL
    await redis.set(key, userid, {
        EX: TOKEN_EXPIRY_SECONDS
    });

    return token;
}

/**
 * Validate CSRF token
 */
async function validateCsrfToken(token, userid) {
    if (!token) return false;

    const key = `csrf:token:${token}`;
    const storedUserid = await redis.get(key);

    if (!storedUserid) return false;

    // Check if token belongs to the user
    if (storedUserid !== userid) {
        return false;
    }

    // Token is valid - delete it (one-time use)
    await redis.del(key);
    return true;
}

/**
 * CSRF Protection Middleware
 * Validates CSRF token on mutation requests (POST, PUT, PATCH, DELETE)
 */
async function csrfProtection(req, res, next) {
    // Skip CSRF check for GET and HEAD requests
    if (req.method === 'GET' || req.method === 'HEAD') {
        return next();
    }

    // Skip CSRF check if user is not authenticated
    if (!req.user || !req.user.userid) {
        return next();
    }

    // Get CSRF token from header or body
    const token = req.headers['x-csrf-token'] || req.body._csrf;

    if (!token) {
        return res.status(403).json({
            message: 'CSRF token missing. Please include X-CSRF-Token header.'
        });
    }

    // Validate token
    const isValid = await validateCsrfToken(token, req.user.userid);
    if (!isValid) {
        return res.status(403).json({
            message: 'Invalid or expired CSRF token. Please refresh and try again.'
        });
    }

    next();
}

/**
 * Endpoint to get CSRF token
 */
async function getCsrfToken(req, res) {
    if (!req.user || !req.user.userid) {
        return res.status(401).json({ message: 'Authentication required' });
    }

    try {
        const token = await generateCsrfToken(req.user.userid);

        res.json({
            csrfToken: token,
            expiresIn: TOKEN_EXPIRY_SECONDS
        });
    } catch (err) {
        console.error('CSRF Generation Error:', err);
        res.status(500).json({ message: 'Failed to generate CSRF token' });
    }
}

module.exports = {
    csrfProtection,
    getCsrfToken,
    generateCsrfToken,
    validateCsrfToken
};
