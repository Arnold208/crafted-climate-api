const express = require('express');
const passport = require('../../config/passport');
const router = express.Router();
const googleController = require('./google.controller');

/**
 * @swagger
 * /auth/google:
 *   get:
 *     tags: [Authentication]
 *     summary: Initiate Google OAuth login
 *     description: |
 *       Redirects user to Google Sign-In page.
 *       
 *       **Note:** Typical "Execute" via Swagger UI will fail due to CORS restrictions on AJAX redirects to Google. 
 *       Please **[click here to initiate login](/auth/google)** directly in your browser.
 *     responses:
 *       302:
 *         description: Redirect to Google
 */
router.get('/', (req, res, next) => {
    const platform = req.query.platform || 'web';
    const invitationId = req.query.invitationId || null;
    const redirectUri = req.query.redirectUri || null;

    const stateObj = { platform, invitationId, redirectUri };
    const stateStr = Buffer.from(JSON.stringify(stateObj)).toString('base64');

    passport.authenticate('google', {
        scope: ['profile', 'email'],
        state: stateStr
    })(req, res, next);
});

/**
 * @swagger
 * /auth/google/callback:
 *   get:
 *     tags: [Authentication]
 *     summary: Google OAuth Callback
 *     description: Handles return from Google and issues JWT tokens
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *           example: "code_example"
 *         required: true
 *         description: Authorization code from Google
 *     responses:
 *       200:
 *         description: Authentication successful, returns JWT tokens
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "This is a status update notification."
 *                 accessToken:
 *                   type: string
 *                   example: "accessToken_example"
 *                 refreshToken:
 *                   type: string
 *                   example: "ref-tok-abcdef123456"
 *                 user:
 *                   type: object
 */
router.get('/callback', (req, res, next) => {
    let failureRedirect = '/api/auth/login';
    const state = req.query.state;
    if (state) {
        try {
            const decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
            if (decodedState.redirectUri) {
                const failureUrl = new URL(decodedState.redirectUri);
                failureUrl.searchParams.set('error', 'Authentication failed');
                failureRedirect = failureUrl.toString();
            } else {
                const defaultAppUrl = process.env.APP_URL || 'https://console.craftedclimate.co';
                failureRedirect = `${defaultAppUrl}/login?error=Authentication failed`;
            }
        } catch (e) {
            // Fallback on JSON parse error
        }
    }

    passport.authenticate('google', { failureRedirect, session: false })(req, res, next);
}, googleController.googleCallback);

module.exports = router;
