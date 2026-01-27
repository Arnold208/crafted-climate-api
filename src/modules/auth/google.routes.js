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
 *     description: Redirects user to Google Sign-In page
 *     responses:
 *       302:
 *         description: Redirect to Google
 */
router.get('/', passport.authenticate('google'));

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
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *                 user:
 *                   type: object
 */
router.get('/callback',
    passport.authenticate('google', { failureRedirect: '/api/auth/login', session: false }),
    googleController.googleCallback
);

module.exports = router;
