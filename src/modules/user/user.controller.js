const userService = require('./user.service');
const { createUserSession, destroyUserSession } = require('../../middleware/sessionMiddleware');
const levelConfigService = require('../../services/levelConfig.service');

class UserController {
    constructor() {
        this.getMyQuests = this.getMyQuests.bind(this);
        this.completeQuest = this.completeQuest.bind(this);
        this.getMyBadges = this.getMyBadges.bind(this);
        this.checkAndAwardBadges = this.checkAndAwardBadges.bind(this);
    }

    async signup(req, res) {
        try {
            const { username, email, password, invitationId, contact, firstName, lastName, country } = req.body;

            if (!username || !email || !password) {
                return res.status(400).send({ message: 'Please provide username, email, and password' });
            }

            const result = await userService.signup({
                username, email: email.toLowerCase(), password, invitationId, contact, firstName, lastName, country,
                file: req.file
            });

            return res.status(201).send({
                message: 'User registered successfully',
                ...result
            });

        } catch (error) {
            console.error('[UserController] Signup Error:', error);
            if (error.message.includes('exists') || error.message.includes('Invalid')) {
                return res.status(400).send({ message: error.message });
            }
            return res.status(500).send({ message: 'Internal server error', error: error.message });
        }
    }

    async login(req, res) {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).send({ message: 'Please provide email and password' });
            }

            // Reject non-string inputs early — prevents NoSQL injection attempts from crashing toLowerCase()
            if (typeof email !== 'string' || typeof password !== 'string') {
                return res.status(400).send({ message: 'Invalid credentials format' });
            }

            const result = await userService.login({ email: email.toLowerCase(), password });

            // Create a session alongside the JWT so browser clients (dashboard, partner portals)
            // are authenticated via cookie without needing to manage tokens manually.
            // Non-browser clients (mobile, API) simply ignore the Set-Cookie header.
            try {
                await createUserSession(req, result.user);
            } catch (sessionErr) {
                // Session failure must never block login — JWT is still returned.
                console.error('[UserController] Session creation failed (non-fatal):', sessionErr.message);
            }

            return res.status(200).send(result);
        } catch (error) {
            console.error('[UserController] Login Error:', error.message);
            if (error.message === 'User not found' || error.message === 'Invalid Password' || error.message === 'Account not verified') {
                return res.status(401).send({ message: error.message });
            }
            if (error.message.includes('provide email') || error.message.includes('Invalid credentials') || error.statusCode === 400) {
                return res.status(400).send({ message: error.message });
            }
            return res.status(500).send({ message: 'Internal server error', error: error.message });
        }
    }


    async verifyOtp(req, res) {
        try {
            const { email, otp } = req.body;
            if (!email || !otp) return res.status(400).json({ message: 'Email and OTP required' });

            const result = await userService.verifyOtp({ email: email.toLowerCase(), otp });
            res.status(200).json(result);
        } catch (error) {
            if (error.message.includes('not found')) return res.status(404).json({ message: error.message });
            if (error.message.includes('Invalid') || error.message.includes('expired')) return res.status(400).json({ message: error.message });
            res.status(500).json({ message: error.message });
        }
    }

    async resendOtp(req, res) {
        try {
            const { email } = req.body;
            if (!email) return res.status(400).json({ message: 'Email is required' });

            const result = await userService.resendOtp({ email: email.toLowerCase() });
            res.status(200).json(result);
        } catch (error) {
            if (error.message.includes('not found')) return res.status(404).json({ message: error.message });
            if (error.message.includes('wait') || error.message.includes('verified')) return res.status(400).json({ message: error.message });
            res.status(500).json({ message: error.message });
        }
    }

    async getProfile(req, res) {
        try {
            const user = await userService.getUserById(req.user.userid);
            res.status(200).json({
                message: 'User profile retrieved successfully',
                user
            });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async refreshToken(req, res) {
        try {
            const { refreshToken } = req.body;
            if (!refreshToken) return res.status(400).json({ message: 'Refresh Token is required' });

            const result = await userService.refreshToken(refreshToken);
            res.status(200).json({
                message: 'Token refreshed successfully',
                ...result
            });
        } catch (error) {
            if (error.message.includes('expired') || error.message.includes('Invalid')) {
                return res.status(401).json({ message: error.message }); // 401 for auth issues
            }
            if (error.message.includes('Suspended')) {
                return res.status(403).json({ message: error.message });
            }
            res.status(500).json({ message: error.message });
        }
    }

    async forgotPassword(req, res) {
        try {
            const { email } = req.body;
            if (!email) return res.status(400).json({ message: 'Email is required' });

            const result = await userService.forgotPassword({ email: email.toLowerCase() });
            res.status(200).json(result);
        } catch (error) {
            if (error.message.includes('not found')) return res.status(404).json({ message: error.message });
            res.status(500).json({ message: error.message });
        }
    }

    async resetPassword(req, res) {
        try {
            const { email, otp, newPassword } = req.body;
            if (!email || !otp || !newPassword) {
                return res.status(400).json({ message: 'Email, OTP, and newPassword are required' });
            }

            const result = await userService.resetPassword({ email: email.toLowerCase(), otp, newPassword });
            res.status(200).json(result);
        } catch (error) {
            if (error.message.includes('Invalid') || error.message.includes('expired')) {
                return res.status(400).json({ message: error.message });
            }
            res.status(500).json({ message: error.message });
        }
    }
    async updateProfile(req, res) {
        try {
            const userId = req.user.userid;
            const updateData = req.body;

            // Handle Multipart/Form-Data parsing nuances
            if (updateData.socialLinks && typeof updateData.socialLinks === 'string') {
                try {
                    updateData.socialLinks = JSON.parse(updateData.socialLinks);
                } catch (e) {
                    console.error("Failed to parse socialLinks:", e);
                }
            }

            // Whitelist allowed fields for profile update
            const allowedFields = ['firstName', 'lastName', 'contact', 'jobTitle', 'bio', 'socialLinks'];
            const filteredUpdate = Object.keys(updateData)
                .filter(key => allowedFields.includes(key))
                .reduce((obj, key) => {
                    // Filter out null, undefined, and empty strings
                    if (updateData[key] !== null && updateData[key] !== undefined && updateData[key] !== "") {
                        obj[key] = updateData[key];
                    }
                    return obj;
                }, {});

            // Pass file if present
            if (req.file) {
                filteredUpdate.file = req.file;
            }

            if (Object.keys(filteredUpdate).length === 0 && !req.file) {
                return res.status(400).json({ message: 'No valid fields provided for update' });
            }

            const updatedUser = await userService.updateProfile(userId, filteredUpdate);
            res.status(200).json({ message: 'Profile updated successfully', user: updatedUser });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async updatePreferences(req, res) {
        try {
            const userId = req.user.userid;
            const { preferences, notificationSettings } = req.body;

            if (!preferences && !notificationSettings) {
                return res.status(400).json({ message: 'Provide preferences or notificationSettings to update' });
            }

            const updatedUser = await userService.updatePreferences(userId, { preferences, notificationSettings });
            res.status(200).json({ message: 'Preferences updated successfully', user: updatedUser });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async changePassword(req, res) {
        try {
            const userId = req.user.userid;
            const { oldPassword, newPassword } = req.body;

            if (!oldPassword || !newPassword) {
                return res.status(400).json({ message: 'Old and new passwords are required' });
            }

            if (oldPassword === newPassword) {
                return res.status(400).json({ message: 'New password cannot be the same as the old password' });
            }

            await userService.changePassword(userId, oldPassword, newPassword);
            res.status(200).json({ message: 'Password changed successfully' });
        } catch (error) {
            if (error.message === 'Incorrect password') {
                return res.status(401).json({ message: error.message });
            }
            res.status(500).json({ message: error.message });
        }
    }

    async muteDevice(req, res) {
        try {
            const userId = req.user.userid;
            const { deviceId } = req.params;
            await userService.muteDevice(userId, deviceId);
            res.status(200).json({ message: 'Device muted successfully' });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async unmuteDevice(req, res) {
        try {
            const userId = req.user.userid;
            const { deviceId } = req.params;
            await userService.unmuteDevice(userId, deviceId);
            res.status(200).json({ message: 'Device unmuted successfully' });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async getMutedDevices(req, res) {
        try {
            const userId = req.user.userid;
            const muted = await userService.getMutedDevices(userId);
            res.status(200).json({ mutedDevices: muted });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async backofficeLogin(req, res) {
        try {
            const { email, password } = req.body;
            const result = await userService.initiateBackofficeLogin({ email, password });
            res.status(200).json(result);
        } catch (error) {
            console.error('[UserController] Backoffice Login Error:', error.message);
            if (error.message.includes('User not found') || error.message.includes('Invalid Password')) {
                return res.status(401).json({ message: error.message });
            }
            if (error.message.includes('restricted') || error.message.includes('Suspended')) {
                return res.status(403).json({ message: error.message });
            }
            res.status(500).json({ message: error.message });
        }
    }

    async backofficeVerifyOtp(req, res) {
        try {
            const { tempSessionId, otp } = req.body;
            const result = await userService.verifyBackofficeOtp({ tempSessionId, otp });

            // Create session for the backoffice admin on successful MFA verification.
            if (result && result.user) {
                try {
                    await createUserSession(req, result.user);
                } catch (sessionErr) {
                    console.error('[UserController] Backoffice session creation failed (non-fatal):', sessionErr.message);
                }
            }

            res.status(200).json(result);
        } catch (error) {
            console.error('[UserController] Backoffice Verify OTP Error:', error.message);
            if (error.message.includes('expired') || error.message.includes('invalid') || error.message.includes('Invalid OTP')) {
                return res.status(400).json({ message: error.message });
            }
            res.status(500).json({ message: error.message });
        }
    }

    async requestAdminPasswordReset(req, res) {
        try {
            const { email } = req.body;
            const result = await userService.requestAdminPasswordReset({ email });
            res.status(200).json(result);
        } catch (error) {
            console.error('[UserController] Backoffice Password Request Error:', error.message);
            if (error.message.includes('restricted') || error.message.includes('Unauthorized')) {
                return res.status(403).json({ message: error.message });
            }
            if (error.message.includes('not found')) {
                return res.status(404).json({ message: error.message });
            }
            res.status(500).json({ message: error.message });
        }
    }

    async backofficeResetPassword(req, res) {
        try {
            const { requestId, token, newPassword } = req.body;
            const result = await userService.resetBackofficePassword({ requestId, token, newPassword });
            res.status(200).json(result);
        } catch (error) {
            console.error('[UserController] Backoffice Password Reset Error:', error.message);
            if (error.message.includes('not authorized') || error.message.includes('Invalid') || error.message.includes('expired')) {
                return res.status(400).json({ message: error.message });
            }
            if (error.message.includes('not found')) {
                return res.status(404).json({ message: error.message });
            }
            res.status(500).json({ message: error.message });
        }
    }

    /**
     * Logout — destroys the session and clears the session cookie.
     * Works for both browser (session) and token-based clients.
     * Token-based clients handle their own JWT invalidation client-side.
     */
    async logout(req, res) {
        try {
            if (req.session && req.session.user) {
                await destroyUserSession(req);
            }
            // Clear cookie regardless — removes stale cookies from browser clients
            res.clearCookie('cc.sid', { path: '/' });
            return res.status(200).json({ success: true, message: 'Logged out successfully' });
        } catch (error) {
            console.error('[UserController] Logout Error:', error.message);
            return res.status(500).json({ message: 'Logout failed' });
        }
    }

    // ── LOYALTY POINTS ────────────────────────────────────────────────────────

    /**
     * GET /api/users/me/points
     * Returns the authenticated user's current points total, level and recent history.
     */
    async getMyPoints(req, res) {
        try {
            const userId = req.user?.userid || req.user?.id || req.user?._id;
            if (!userId) return res.status(401).json({ message: 'Unauthorised' });

            const User = require('../../models/user/userModel');
            const user = await User.findOne(
                { userid: userId },
                { loyaltyPoints: 1, pointsHistory: 1 }
            ).lean();

            if (!user) return res.status(404).json({ message: 'User not found' });

            const points        = user.loyaltyPoints || 0;
            const history       = (user.pointsHistory || []).slice(0, 50);
            const actionsCount  = history.length;
            const lessonsCount  = history.filter(h => h.action === 'lesson_completed').length;

            // Level resolved from configurable DB thresholds (cached, with default fallback)
            const level = await levelConfigService.computeLevelAsync(points);

            return res.status(200).json({
                points,
                level,
                actionsCount,
                lessonsCount,
                recentHistory: history.slice(0, 20).map(h => ({
                    action:    h.action,
                    value:     h.value,
                    timestamp: h.timestamp,
                })),
            });
        } catch (error) {
            console.error('[UserController] getMyPoints Error:', error.message);
            return res.status(500).json({ message: 'Failed to retrieve points' });
        }
    }

    /**
     * POST /api/users/me/points/add
     * Body: { action: string, metadata?: object }
     * Awards points using the server-authoritative action values from LevelConfig.
     */
    async addPoints(req, res) {
        try {
            const userId = req.user?.userid || req.user?.id || req.user?._id;
            if (!userId) return res.status(401).json({ message: 'Unauthorised' });

            // Load action values from the configurable LevelConfig (cached)
            const config = await levelConfigService.getConfig();
            const actionValues = config.actionValues;

            const { action, metadata } = req.body;
            if (!action || !(action in actionValues)) {
                return res.status(400).json({
                    message: `Invalid action. Allowed: ${Object.keys(actionValues).join(', ')}`,
                });
            }

            // Server-authoritative value — client cannot override
            const awardedPoints = actionValues[action];

            const User = require('../../models/user/userModel');

            // Atomically increment points and push to history (capped at 50 entries)
            const updated = await User.findOneAndUpdate(
                { userid: userId },
                {
                    $inc: { loyaltyPoints: awardedPoints },
                    $push: {
                        pointsHistory: {
                            $each: [{ action, value: awardedPoints, timestamp: new Date(), metadata: metadata || {} }],
                            $slice: -50, // keep only the last 50 entries
                        },
                    },
                },
                { new: true, select: 'loyaltyPoints' }
            ).lean();

            if (!updated) return res.status(404).json({ message: 'User not found' });

            const level = await levelConfigService.computeLevelAsync(updated.loyaltyPoints);

            return res.status(200).json({
                success:  true,
                awarded:  awardedPoints,
                newTotal: updated.loyaltyPoints,
                level,
            });
        } catch (error) {
            console.error('[UserController] addPoints Error:', error.message);
            return res.status(500).json({ message: 'Failed to add points' });
        }
    }

    /**
     * GET /api/user/leaderboard
     * Returns the loyalty points leaderboard.
     * Only users with participateInPoints = true are included.
     * Returns top 10 users + the authenticated user's current rank and status.
     */
    async getLeaderboard(req, res) {
        try {
            const userId = req.user?.userid || req.user?.id || req.user?._id;
            if (!userId) return res.status(401).json({ message: 'Unauthorised' });

            const User = require('../../models/user/userModel');

            // Find the current user first to check participation
            const currentUser = await User.findOne({ userid: userId }, { username: 1, loyaltyPoints: 1, participateInPoints: 1 }).lean();
            if (!currentUser) return res.status(404).json({ message: 'User not found' });

            // Fetch all participating users
            const allParticipating = await User.find(
                { participateInPoints: true, deletedAt: null },
                { username: 1, loyaltyPoints: 1, userid: 1 }
            ).lean();

            // Sort in memory to avoid Cosmos DB excluded index path order-by errors
            allParticipating.sort((a, b) => (b.loyaltyPoints || 0) - (a.loyaltyPoints || 0));

            // Calculate ranks
            const leaderboard = allParticipating.map((u, index) => ({
                userid: u.userid,
                name: u.username,
                points: u.loyaltyPoints || 0,
                rank: index + 1,
                isSelf: u.userid === userId
            }));

            // Find current user's rank if participating
            let currentUserRank = -1;
            if (currentUser.participateInPoints) {
                currentUserRank = leaderboard.findIndex(u => u.userid === userId) + 1;
            }

            // Return top 10
            const topTen = leaderboard.slice(0, 10);

            return res.status(200).json({
                success: true,
                participating: currentUser.participateInPoints ?? null,
                userPoints: currentUser.loyaltyPoints || 0,
                userRank: currentUserRank,
                topTen,
                leaderboard // full list for fallback
            });
        } catch (error) {
            console.error('[UserController] getLeaderboard Error:', error.message);
            return res.status(500).json({ message: 'Failed to retrieve leaderboard' });
        }
    }

    /**
     * POST /api/user/me/points/opt-in
     * Body: { participate: boolean }
     * Opts the user in or out of the points leaderboard system.
     */
    async optInPoints(req, res) {
        try {
            const userId = req.user?.userid || req.user?.id || req.user?._id;
            if (!userId) return res.status(401).json({ message: 'Unauthorised' });

            const { participate } = req.body;
            if (participate === undefined) {
                return res.status(400).json({ message: 'participate value is required' });
            }

            const User = require('../../models/user/userModel');
            const updated = await User.findOneAndUpdate(
                { userid: userId },
                { $set: { participateInPoints: participate } },
                { new: true, select: 'participateInPoints loyaltyPoints' }
            ).lean();

            if (!updated) return res.status(404).json({ message: 'User not found' });

            return res.status(200).json({
                success: true,
                participateInPoints: updated.participateInPoints,
                points: updated.loyaltyPoints || 0
            });
        } catch (error) {
            console.error('[UserController] optInPoints Error:', error.message);
            return res.status(500).json({ message: 'Failed to update opt-in status' });
        }
    }

    // ── QUESTS ────────────────────────────────────────────────────────────────

    /**
     * Default quests definition (extend here or move to DB later)
     */
    _getQuestDefinitions() {
        return [
            {
                questId: 'quest_aqi_explorer',
                title: 'Open Air Quality Preview',
                description: 'Open the AQI detail card from the dashboard to explore real-time air quality data.',
                points: 30,
                badgeId: 'badge_air_seeker',
                oneTimeOnly: true,
                category: 'exploration',
                iconKey: 'wind',
            },
        ];
    }

    /**
     * Default badges definition
     */
    _getBadgeDefinitions() {
        return [
            {
                badgeId: 'badge_first_step',
                title: 'First Step',
                description: 'Successfully signed up and logged in for the first time.',
                iconKey: 'sprout',
                colorHex: '#4CAF50',
                awardedOn: 'signup',
            },
            {
                badgeId: 'badge_air_seeker',
                title: 'Air Seeker',
                description: 'Opened the AQI detail card for the first time.',
                iconKey: 'wind',
                colorHex: '#2196F3',
                awardedOn: 'quest_aqi_explorer',
            },
        ];
    }

    /**
     * GET /api/users/me/quests
     * Returns all available quests with completion status for the authenticated user.
     */
    async getMyQuests(req, res) {
        try {
            const userId = req.user?.userid || req.user?.id || req.user?._id;
            if (!userId) return res.status(401).json({ message: 'Unauthorised' });

            const User = require('../../models/user/userModel');
            const user = await User.findOne({ userid: userId }, { completedQuests: 1 }).lean();
            if (!user) return res.status(404).json({ message: 'User not found' });

            const completedIds = new Set((user.completedQuests || []).map(q => q.questId));
            const quests = this._getQuestDefinitions().map(q => ({
                ...q,
                completed: completedIds.has(q.questId),
                completedAt: (user.completedQuests || []).find(cq => cq.questId === q.questId)?.completedAt ?? null,
            }));

            return res.status(200).json({ quests });
        } catch (error) {
            console.error('[UserController] getMyQuests Error:', error.message);
            return res.status(500).json({ message: 'Failed to retrieve quests' });
        }
    }

    /**
     * POST /api/users/me/quests/:questId/complete
     * Marks a quest as completed and awards points + badge. Idempotent.
     */
    async completeQuest(req, res) {
        try {
            const userId = req.user?.userid || req.user?.id || req.user?._id;
            if (!userId) return res.status(401).json({ message: 'Unauthorised' });

            const { questId } = req.params;
            const quest = this._getQuestDefinitions().find(q => q.questId === questId);
            if (!quest) return res.status(404).json({ message: 'Quest not found' });

            const User = require('../../models/user/userModel');
            const user = await User.findOne({ userid: userId }, { completedQuests: 1, loyaltyPoints: 1, earnedBadges: 1 }).lean();
            if (!user) return res.status(404).json({ message: 'User not found' });

            // Idempotency check — do not double-award
            const alreadyCompleted = (user.completedQuests || []).some(q => q.questId === questId);
            if (alreadyCompleted) {
                return res.status(200).json({
                    alreadyClaimed: true,
                    message: 'Quest already completed',
                    points: user.loyaltyPoints || 0,
                });
            }

            // Award points
            const config = await levelConfigService.getConfig();
            const awardedPoints = quest.points;

            const now = new Date();
            const update = {
                $inc: { loyaltyPoints: awardedPoints },
                $push: {
                    pointsHistory: {
                        $each: [{ action: 'challenge_completed', value: awardedPoints, timestamp: now, metadata: { questId } }],
                        $slice: -50,
                    },
                    completedQuests: { questId, completedAt: now },
                },
            };

            // Also award badge if applicable and not already earned
            let badgeAwarded = null;
            if (quest.badgeId) {
                const alreadyHasBadge = (user.earnedBadges || []).some(b => b.badgeId === quest.badgeId);
                if (!alreadyHasBadge) {
                    update.$push.earnedBadges = { badgeId: quest.badgeId, earnedAt: now };
                    const badge = this._getBadgeDefinitions().find(b => b.badgeId === quest.badgeId);
                    badgeAwarded = badge || null;
                }
            }

            const updated = await User.findOneAndUpdate(
                { userid: userId },
                update,
                { new: true, select: 'loyaltyPoints' }
            ).lean();

            const level = await levelConfigService.computeLevelAsync(updated.loyaltyPoints);

            return res.status(200).json({
                alreadyClaimed: false,
                awarded: awardedPoints,
                newTotal: updated.loyaltyPoints,
                level,
                badgeAwarded,
            });
        } catch (error) {
            console.error('[UserController] completeQuest Error:', error.message);
            return res.status(500).json({ message: 'Failed to complete quest' });
        }
    }

    /**
     * GET /api/users/me/badges
     * Returns all badges with earned/locked status for the authenticated user.
     */
    async getMyBadges(req, res) {
        try {
            const userId = req.user?.userid || req.user?.id || req.user?._id;
            if (!userId) return res.status(401).json({ message: 'Unauthorised' });

            const User = require('../../models/user/userModel');
            const user = await User.findOne({ userid: userId }, { earnedBadges: 1 }).lean();
            if (!user) return res.status(404).json({ message: 'User not found' });

            const earnedIds = new Set((user.earnedBadges || []).map(b => b.badgeId));
            const badges = this._getBadgeDefinitions().map(b => ({
                ...b,
                earned: earnedIds.has(b.badgeId),
                earnedAt: (user.earnedBadges || []).find(eb => eb.badgeId === b.badgeId)?.earnedAt ?? null,
            }));

            return res.status(200).json({ badges });
        } catch (error) {
            console.error('[UserController] getMyBadges Error:', error.message);
            return res.status(500).json({ message: 'Failed to retrieve badges' });
        }
    }

    /**
     * POST /api/users/me/badges/check
     * Awards First Step badge on first login if not already earned.
     */
    async checkAndAwardBadges(req, res) {
        try {
            const userId = req.user?.userid || req.user?.id || req.user?._id;
            if (!userId) return res.status(401).json({ message: 'Unauthorised' });

            const User = require('../../models/user/userModel');
            const user = await User.findOne({ userid: userId }, { earnedBadges: 1 }).lean();
            if (!user) return res.status(404).json({ message: 'User not found' });

            const earnedIds = new Set((user.earnedBadges || []).map(b => b.badgeId));
            const newBadges = [];
            const now = new Date();

            // Award First Step badge if not yet earned
            if (!earnedIds.has('badge_first_step')) {
                newBadges.push({ badgeId: 'badge_first_step', earnedAt: now });
            }

            if (newBadges.length > 0) {
                await User.updateOne(
                    { userid: userId },
                    { $push: { earnedBadges: { $each: newBadges } } }
                );
            }

            const awardedDefs = newBadges.map(nb =>
                this._getBadgeDefinitions().find(b => b.badgeId === nb.badgeId)
            ).filter(Boolean);

            return res.status(200).json({
                success: true,
                newBadges: awardedDefs,
            });
        } catch (error) {
            console.error('[UserController] checkAndAwardBadges Error:', error.message);
            return res.status(500).json({ message: 'Failed to check badges' });
        }
    }
}

module.exports = new UserController();

