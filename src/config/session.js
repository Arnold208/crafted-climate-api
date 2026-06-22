'use strict';

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║         CRAFTED CLIMATE — SESSION CONFIGURATION                         ║
 * ║                                                                          ║
 * ║  Uses express-session + connect-mongo (MongoDB-backed store).            ║
 * ║                                                                          ║
 * ║  Auth chain (all three coexist, non-destructive):                       ║
 * ║    1. Session cookie   → browser dashboards, Google OAuth               ║
 * ║    2. Bearer JWT       → mobile apps, SPAs that store tokens            ║
 * ║    3. X-API-Key        → partner integrations                           ║
 * ║                                                                          ║
 * ║  Session data shape (req.session.user):                                  ║
 * ║    { userid, email, platformRole, currentOrganizationId,                 ║
 * ║      personalOrganizationId, firstName, lastName }                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

const session = require('express-session');
const { MongoStore } = require('connect-mongo');

const isProd = process.env.NODE_ENV === 'production';

/**
 * Build and return the configured session middleware.
 * Called once during app startup — requires MongoDB to be reachable
 * (connect-mongo lazily connects via the existing mongoose connection).
 */
function buildSessionMiddleware() {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) {
        console.warn(
            '[Session] WARNING: SESSION_SECRET is missing or shorter than 32 characters. ' +
            'Add SESSION_SECRET to your .env.development file before using browser sessions.'
        );
    }

    return session({
        // ── Secret ────────────────────────────────────────────────────────────
        // Use an array to support key rotation: first key signs new sessions,
        // remaining keys are accepted for verification of old sessions.
        secret: secret || 'cc-dev-fallback-secret-change-in-prod',

        // ── Store ─────────────────────────────────────────────────────────────
        // Shares the existing mongoose connection — no second DB connection.
        store: MongoStore.create({
            mongoUrl: process.env.COSMOS_CONNECTION_STRING,
            dbName: process.env.DATABASE_NAME,
            collectionName: 'sessions',
            ttl: 7 * 24 * 60 * 60,          // 7 days (seconds) — matches cookie maxAge
            autoRemove: 'native',            // MongoDB TTL index handles cleanup
            touchAfter: 24 * 3600,           // Lazy session update — only write if data changed
                                             // and at most once per 24h (reduces DB writes)
            crypto: {
                secret: secret || 'cc-dev-fallback-secret-change-in-prod'
            }
        }),

        // ── Cookie ────────────────────────────────────────────────────────────
        cookie: {
            httpOnly: true,                  // Not accessible via document.cookie (XSS protection)
            secure: isProd,                  // HTTPS-only in production; HTTP OK in dev
            sameSite: isProd ? 'strict' : 'lax', // CSRF protection
            maxAge: 7 * 24 * 60 * 60 * 1000,    // 7 days (ms)
            path: '/'
        },

        // ── Session behaviour ─────────────────────────────────────────────────
        name: 'cc.sid',                      // Custom cookie name (not the default 'connect.sid')
        resave: false,                       // Don't write session if nothing changed
        saveUninitialized: false,            // Don't create empty sessions for unauthenticated users
        rolling: true,                       // Reset expiry on every authenticated request
    });
}

module.exports = buildSessionMiddleware;
