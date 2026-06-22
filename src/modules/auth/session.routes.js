'use strict';

/**
 * Session Utility Routes
 *
 * These routes complement the main auth flow (POST /api/auth/login + POST /api/auth/logout)
 * which already handle session creation/destruction.
 *
 * GET    /api/auth/session/me   — Returns the current session user (dashboard load check)
 * PATCH  /api/auth/session/org  — Switch active organisation within the session
 *
 * Both are tagged under [Authentication] to appear in the same Swagger/Postman collection.
 */

const router = require('express').Router();
const Organization = require('../../models/organization/organizationModel');
const User = require('../../models/user/userModel');
const { requireSession, destroyUserSession } = require('../../middleware/sessionMiddleware');

const ok  = (res, data, code = 200) => res.status(code).json({ success: true, ...data });
const err = (res, msg, code = 400) => res.status(code).json({ success: false, message: msg });

// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/auth/session/me:
 *   get:
 *     tags: [Authentication]
 *     summary: Get current session user
 *     description: |
 *       Returns fresh user data for the active browser session.
 *       Call this on dashboard load to confirm the session is still valid.
 *       Returns 401 if no active session exists.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Active session — fresh user data returned
 *       401:
 *         description: No active session
 */
router.get('/me', requireSession, async (req, res) => {
    try {
        const user = await User.findOne({ userid: req.session.user.userid })
            .select('-password -keyHash -refreshToken -refreshTokens -otp -otpExpiresAt')
            .lean();

        if (!user) {
            await destroyUserSession(req);
            res.clearCookie('cc.sid', { path: '/' });
            return err(res, 'Session user no longer exists. Please log in again.', 401);
        }

        return ok(res, {
            user,
            sessionExpiresAt: new Date(Date.now() + req.session.cookie.maxAge).toISOString()
        });

    } catch (e) {
        console.error('[Session] Me error:', e);
        return err(res, 'Failed to fetch session user', 500);
    }
});

// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/auth/session/org:
 *   patch:
 *     tags: [Authentication]
 *     summary: Switch active organisation within the session
 *     description: |
 *       Updates `currentOrganizationId` in the active session without a full re-login.
 *       Use this in the dashboard when a user switches between their organisations.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [organizationId]
 *             properties:
 *               organizationId:
 *                 type: string
 *                 example: "org-abc-123"
 *     responses:
 *       200:
 *         description: Active organisation updated in session
 *       403:
 *         description: User is not a member of this organisation
 */
router.patch('/org', requireSession, async (req, res) => {
    try {
        const { organizationId } = req.body;
        if (!organizationId) return err(res, 'organizationId is required');

        const userid = req.session.user.userid;

        const org = await Organization.findOne({
            organizationId,
            deletedAt: null,
            'collaborators.userid': userid
        }).lean();

        if (!org) {
            return err(res, 'You are not a member of this organisation', 403);
        }

        req.session.user.currentOrganizationId = organizationId;
        await new Promise((resolve, reject) =>
            req.session.save(e => e ? reject(e) : resolve())
        );

        return ok(res, {
            message: 'Active organisation updated',
            currentOrganizationId: organizationId
        });

    } catch (e) {
        console.error('[Session] Org switch error:', e);
        return err(res, 'Failed to switch organisation', 500);
    }
});

module.exports = router;
