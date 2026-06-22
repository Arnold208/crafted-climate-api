'use strict';

/**
 * Session Auth Middleware
 *
 * Reads req.session.user (written at login) and populates req.user
 * in the same shape that bearermiddleware.js uses.
 *
 * This runs GLOBALLY in app.js (after the session middleware).
 * It is non-destructive — if req.user is already set by a previous
 * middleware (JWT Bearer or API Key), it does nothing.
 *
 * Auth priority order (set in app.js):
 *   1. express-session  → this file populates req.user from cookie
 *   2. bearermiddleware → JWT Bearer overwrites req.user if token present
 *   3. authenticateApiKey → API key overwrites if X-API-Key header present
 *
 * Individual route guards (authenticateToken, authenticateApiKey, requireSession)
 * still enforce which auth method is REQUIRED for that specific route.
 */

/**
 * Global middleware: populate req.user from session if a session exists.
 * Does NOT reject unauthenticated requests — that is the job of route guards.
 */
function populateUserFromSession(req, res, next) {
    // Already populated (JWT or API key ran first — shouldn't happen in our order, but be safe)
    if (req.user) return next();

    if (req.session && req.session.user) {
        req.user = req.session.user;
        req.authType = 'session';
    }

    next();
}

/**
 * Route guard: requires a valid session.
 * Use on browser-dashboard routes that should only be accessible via cookie.
 *
 * Example:
 *   router.get('/dashboard', requireSession, dashboardController.get);
 */
function requireSession(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    return res.status(401).json({
        success: false,
        message: 'Session required. Please log in via the Crafted Climate dashboard.',
        code: 'SESSION_REQUIRED'
    });
}

/**
 * Route guard: accepts EITHER a valid session OR a valid JWT.
 * Use on routes that should work from both the browser dashboard and mobile/SPA clients.
 *
 * This is the most permissive auth guard — it checks session first,
 * then falls through to bearermiddleware if no session.
 */
function requireSessionOrToken(req, res, next) {
    if (req.session && req.session.user) {
        req.user = req.session.user;
        req.authType = 'session';
        return next();
    }

    // Fall through to JWT check
    const authenticateToken = require('./bearermiddleware');
    return authenticateToken(req, res, next);
}

/**
 * Helper — write user data into the session after login.
 * Call this from your login controller after verifying credentials.
 *
 * @param {Object} req  - Express request
 * @param {Object} user - Mongoose User document (or plain object)
 * @returns {Promise<void>}
 */
function createUserSession(req, user) {
    return new Promise((resolve, reject) => {
        // Regenerate session ID to prevent session fixation attacks
        req.session.regenerate((err) => {
            if (err) return reject(err);

            req.session.user = {
                userid: user.userid,
                email: user.email,
                username: user.username,
                firstName: user.firstName || '',
                lastName: user.lastName || '',
                platformRole: user.platformRole || 'user',
                role: user.role || 'user',
                currentOrganizationId: user.currentOrganizationId || null,
                personalOrganizationId: user.personalOrganizationId || null,
                organization: user.organization || [],
                profilePicture: user.profilePicture || null,
                verified: user.verified || false,
            };

            req.session.save((saveErr) => {
                if (saveErr) return reject(saveErr);
                resolve();
            });
        });
    });
}

/**
 * Helper — destroy the session (logout).
 *
 * @param {Object} req  - Express request
 * @returns {Promise<void>}
 */
function destroyUserSession(req) {
    return new Promise((resolve, reject) => {
        req.session.destroy((err) => {
            if (err) return reject(err);
            resolve();
        });
    });
}

module.exports = {
    populateUserFromSession,
    requireSession,
    requireSessionOrToken,
    createUserSession,
    destroyUserSession,
};
