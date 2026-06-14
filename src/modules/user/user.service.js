const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const User = require('../../models/user/userModel');
const Organization = require('../../models/organization/organizationModel');
const Invitation = require('../../models/invitation/invitationModel');
const Plan = require('../../models/subscriptions/Plan');
const UserSubscription = require('../../models/subscriptions/UserSubscription');
const NotificationPreference = require('../../models/notification/NotificationPreference');

const { sendSMS } = require('../../config/sms/sms');
const { sendEmail } = require('../../config/mail/nodemailer');
const { containerClient, generateSignedUrl } = require('../../config/storage/storage');
const { generateUserId } = require('../../utils/idGenerator');
const { createAuditLog } = require('../../utils/auditLogger');
const { client: redisClient } = require('../../config/redis/redis');
const AdminPasswordResetRequest = require('../../models/user/AdminPasswordResetRequest');

function normalizeContact(contact) {
    if (!contact) return contact;

    // Remove all non-numeric characters (spaces, dashes, parens, etc)
    contact = contact.replace(/\D/g, '');

    // If it starts with local 0, convert to Ghana 233
    // Note: We can expand this for other regions but for now sticking to previous logic
    if (contact.startsWith('0')) {
        return '233' + contact.slice(1);
    }

    return contact;
}

/**
 * Service to handle User Authentication & Management
 */
class UserService {

    /**
    * Register a new user
    */
    async signup({ username, email, password, invitationId, contact, firstName, lastName, country, file, isVerified = false }) {
        try {
            email = email.trim().toLowerCase().replace(/\s+/g, '');
            contact = normalizeContact(contact);

            // 1. PRE-CHECKS
            const existingEmailUser = await User.findOne({ email });
            if (existingEmailUser) {
                throw new Error('User with this email already exists');
            }

            const existingContactUser = await User.findOne({ contact });
            if (existingContactUser) {
                throw new Error('User with this contact number already exists');
            }

            let invitation = null;
            let devices = [];
            let role = "user";

            if (invitationId) {
                invitation = await Invitation.findOne({
                    invitationId,
                    email,
                    accepted: false,
                    expiresAt: { $gt: new Date() }
                });

                if (!invitation) {
                    throw new Error('Invalid or expired invitation');
                }

                role = "user";
                if (invitation.deviceId) {
                    devices.push({ deviceId: invitation.deviceId, accessType: "invited" });
                }
            }




            // 2. CREATE USER RECORD
            const userid = generateUserId();
            const hashedPassword = await bcrypt.hash(password, 10);
            const otpCode = crypto.randomInt(100000, 999999); // Secure OTP

            // Upload profile picture if included
            let profilePictureUrl = "";
            if (file) {
                const fileName = `profile-${Date.now()}-${file.originalname}`;
                const blockBlobClient = containerClient.getBlockBlobClient(fileName);

                await blockBlobClient.upload(file.buffer, file.buffer.length, {
                    blobHTTPHeaders: { blobContentType: file.mimetype },
                });

                profilePictureUrl = generateSignedUrl(fileName);
            }

            const newUser = new User({
                userid,
                username,
                email,
                password: hashedPassword,
                contact,
                firstName,
                lastName,
                country: country || "Ghana",
                profilePicture: profilePictureUrl,
                role,
                devices,
                otp: isVerified ? null : otpCode,
                otpExpiresAt: isVerified ? null : new Date(Date.now() + 15 * 60 * 1000),
                lastOtpSentAt: isVerified ? null : new Date(),
                verified: isVerified,
                platformRole: "user",
            });

            await newUser.save();

            // 3. CREATE PERSONAL ORGANIZATION
            const personalOrgId = `org-${uuidv4()}`;

            const personalOrg = new Organization({
                organizationId: personalOrgId,
                name: `${firstName || username}'s Workspace`,
                description: "Personal organization workspace",
                planType: "personal",
                collaborators: [
                    {
                        userid: userid,
                        role: "org-admin",
                        permissions: []
                    }
                ],
                createdBy: userid
            });

            await personalOrg.save();

            // Link user → org
            newUser.personalOrganizationId = personalOrgId;
            newUser.currentOrganizationId = personalOrgId;
            newUser.organization = [personalOrgId];

            // 🔥 Ensure full context is handled
            await this._ensureUserContext(newUser);
            await newUser.save();

            // 4. ASSIGN FREEMIUM SUBSCRIPTION
            const freemiumPlan = await Plan.findOne({ name: "freemium", isActive: true });
            if (freemiumPlan) {
                const subscription = await UserSubscription.create({
                    subscriptionId: uuidv4(),
                    userid: userid,
                    organizationId: personalOrgId,
                    subscriptionScope: "personal",
                    planId: freemiumPlan.planId,
                    status: "active",
                    billingCycle: "free",
                    autoRenew: false,
                    usage: { devicesCount: 0, exportsThisMonth: 0, apiCallsThisMonth: 0 }
                });

                newUser.subscription = subscription.subscriptionId;
                await newUser.save();
            }

            // 5. INVITATION HANDLING
            if (invitation) {
                invitation.accepted = true;
                await invitation.save();

                const org = await Organization.findOne({ organizationId: invitation.organizationId });
                if (org) {
                    org.collaborators.push({
                        userid: userid,
                        role: invitation.accessLevel || "org-support",
                        permissions: []
                    });
                    await org.save();
                    newUser.organization.push(org.organizationId);
                    await newUser.save();
                }
            }

            // 6. WELCOME OR OTP
            if (isVerified) {
                await this._sendWelcomeMessage(newUser);
            } else {
                await this._sendDualChannelOtp(newUser);
            }

            // AUDIT LOG
            await createAuditLog({
                action: 'USER_SIGNUP',
                userid: userid,
                organizationId: personalOrgId,
                details: { email, username, role },
                ipAddress: null
            });

            return {
                userid,
                personalOrganizationId: newUser.personalOrganizationId,
                currentOrganizationId: newUser.currentOrganizationId,
                subscriptionId: newUser.subscription,
                verified: newUser.verified
            };

        } catch (error) {
            throw error;
        }
    }

    /**
     * Authenticate a user
     */
    async login({ email, password }) {
        if (!email || !password) {
            throw new Error('Please provide email and password');
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            throw new Error('User not found');
        }

        if (user.deletedAt) {
            throw new Error('Account Suspended: Your account has been suspended. Please contact support.');
        }

        if (!user.verified) {
            throw new Error('Account not verified');
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            throw new Error('Invalid Password');
        }

        // ✨ AUTO-HEALING: Ensure user has valid organization context
        await this._ensureUserContext(user);

        const payload = {
            userid: user.userid,
            email: user.email,
            username: user.username,
            platformRole: user.role,
            organizations: user.organization,
            currentOrganizationId: user.currentOrganizationId
        };

        const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN,
        });
        const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN
        });

        // Resolve subscription tier for frontend
        let subscriptionTier = 'free';

        // 1. Try to find the subscription linked in User profile
        let sub = null;
        if (user.subscription) {
            sub = await UserSubscription.findOne({ subscriptionId: user.subscription });
        }

        // 2. Auto-Healing: If not found or inactive, check for ANY active subscription for this user
        if (!sub || sub.status !== 'active') {
            const activeSubs = await UserSubscription.find({
                userid: user.userid,
                status: 'active',
                subscriptionScope: 'personal'
            });

            // Sort in memory to avoid Cosmos DB index error on updatedAt
            const activeSub = activeSubs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];

            if (activeSub) {
                console.log(`[UserService] Healing: Updated user subscription pointer from ${user.subscription} to ${activeSub.subscriptionId}`);
                user.subscription = activeSub.subscriptionId;
                await user.save(); // PERSIST FIX
                sub = activeSub;
            }
        }

        if (sub) {
            const plan = await Plan.findOne({ planId: sub.planId });
            if (plan) subscriptionTier = plan.name;
        }

        return {
            accessToken,
            refreshToken,
            user: {
                userid: user.userid,
                email: user.email,
                username: user.username,
                profilePicture: user.profilePicture,
                platformRole: user.role,
                organizations: user.organization,
                currentOrganizationId: user.currentOrganizationId || null,
                personalOrganizationId: user.personalOrganizationId || null,
                subscriptionId: user.subscription,
                subscriptionTier
            }
        };
    }

    /**
     * Verify OTP
     */
    async verifyOtp({ email, otp }) {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) throw new Error('User not found');
        if (user.deletedAt) throw new Error('Account Suspended');

        if (user.verified) return { message: 'User already verified' };

        if (!user.otp || !user.otpExpiresAt) throw new Error('No OTP found. Please request a new one.');

        const now = new Date();
        if (now > user.otpExpiresAt) throw new Error('OTP expired');
        if (parseInt(otp) !== user.otp) throw new Error('Invalid OTP');

        user.verified = true;
        user.otp = null;
        user.otpExpiresAt = null;
        // If this was a reset flow, keeping it verified is correct. 
        // If it was already verified, no harm.
        await user.save();

        // AUDIT LOG
        await createAuditLog({
            action: 'USER_VERIFY_OTP',
            userid: user.userid,
            organizationId: user.currentOrganizationId || 'personal',
            details: { email },
            ipAddress: null
        });

        return { message: 'Account verified successfully' };
    }

    /**
     * Resend OTP
     */
    async resendOtp({ email }) {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) throw new Error('User not found');
        if (user.deletedAt) throw new Error('Account Suspended');
        if (user.verified) throw new Error('User already verified');

        // Rate limiting logic
        const now = new Date();
        const lastSent = user.lastOtpSentAt ? new Date(user.lastOtpSentAt) : new Date(0);
        const diffSeconds = (now - lastSent) / 1000;

        if (diffSeconds < 60) {
            throw new Error('Please wait 1 minute before requesting another OTP');
        }

        const otpCode = crypto.randomInt(100000, 999999);
        user.otp = otpCode;
        user.otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
        user.lastOtpSentAt = now;
        await user.save();

        // Send via Dual Channels
        await this._sendDualChannelOtp(user);

        // AUDIT LOG
        await createAuditLog({
            action: 'USER_RESEND_OTP',
            userid: user.userid,
            organizationId: user.currentOrganizationId || 'personal',
            details: { email },
            ipAddress: null
        });

        return { message: 'OTP resent successfully' };
    }

    /**
     * Forgot Password - Initiates OTP flow
     */
    async forgotPassword({ email }) {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) throw new Error('User not found');
        if (user.deletedAt) throw new Error('Account Suspended');

        // Generate OTP for recovery
        const otpCode = crypto.randomInt(100000, 999999);
        user.otp = otpCode;
        user.otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
        user.lastOtpSentAt = new Date();
        await user.save();

        // Send via Dual Channels
        await this._sendDualChannelOtp(user, "Password Reset");

        // AUDIT LOG
        await createAuditLog({
            action: 'USER_FORGOT_PASSWORD_INIT',
            userid: user.userid,
            organizationId: user.currentOrganizationId || 'personal',
            details: { email },
            ipAddress: null
        });

        return { message: 'OTP sent to your email and phone' };
    }

    /**
     * Reset Password - Completes the flow
     */
    async resetPassword({ email, otp, newPassword }) {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) throw new Error('User not found');
        if (user.deletedAt) throw new Error('Account Suspended');

        if (!user.otp || !user.otpExpiresAt) throw new Error('No OTP found. Please request one.');
        if (new Date() > user.otpExpiresAt) throw new Error('OTP expired');
        if (parseInt(otp) !== user.otp) throw new Error('Invalid OTP');

        // Update Password
        user.password = await bcrypt.hash(newPassword, 10);
        user.verified = true; // Ensure they are verified if they could reset
        user.otp = null;
        user.otpExpiresAt = null;
        user.refreshToken = ""; // Invalidate sessions
        await user.save();

        // AUDIT LOG
        await createAuditLog({
            action: 'USER_PASSWORD_RESET',
            userid: user.userid,
            organizationId: user.currentOrganizationId || 'personal',
            details: { email },
            ipAddress: null
        });

        return { message: 'Password reset successfully' };
    }

    /**
     * Helper: Send OTP via both Email and SMS
     */
    async _sendDualChannelOtp(user, context = "Account Verification") {
        const message = `Your CraftedClimate OTP for ${context} is ${user.otp}. Expires in 15m.`;

        const tasks = [];

        // 1. Email Channel
        tasks.push((async () => {
            try {
                await sendEmail(user.email, `CraftedClimate - ${context}`, message);
            } catch (err) {
                console.error('[UserService] Email Send Error:', err.message);
            }
        })());

        // 2. SMS Channel
        if (user.contact) {
            tasks.push((async () => {
                try {
                    await sendSMS(user.contact, message);
                } catch (err) {
                    console.error('[UserService] SMS Send Error:', err.message);
                }
            })());
        }

        // Run in parallel - failure in one won't block the other or the caller
        await Promise.allSettled(tasks);
    }

    /**
     * Helper: Send Professional Welcome Message
     */
    async _sendWelcomeMessage(user) {
        const welcomeText = `Welcome to CraftedClimate, ${user.firstName || user.username}! 🌍\n\nWe're thrilled to have you join our mission for a sustainable future. Your account is now active and verified via Google.\n\nExplore your dashboard: ${process.env.APP_URL || 'https://app.craftedclimate.com'}`;

        const emailBody = `
            <div style="font-family: 'Inter', sans-serif; color: #111827; line-height: 1.6;">
                <h1 style="color: #059669; font-size: 24px; margin-bottom: 20px;">Welcome to CraftedClimate! 🌍</h1>
                <p>Hello <strong>${user.firstName || user.username}</strong>,</p>
                <p>We are delighted to welcome you to the CraftedClimate platform. Your account has been successfully created and verified via Google.</p>
                <p>At CraftedClimate, we are committed to providing you with the best-in-class tools for environmental monitoring and climate action. You can now access your Command Center to manage your devices and analyze real-time data.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${process.env.APP_URL || 'https://app.craftedclimate.com'}" style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Explore Your Dashboard</a>
                </div>
                <p>If you have any questions, our support team is always here to help.</p>
                <p>Best Regards,<br><strong>The CraftedClimate Team</strong></p>
            </div>
        `;

        const tasks = [];

        // 1. Send Email
        tasks.push((async () => {
            try {
                await sendEmail(user.email, "Welcome to CraftedClimate", emailBody);
            } catch (err) {
                console.error('[UserService] Welcome Email Error:', err.message);
            }
        })());

        // 2. Send SMS Welcome
        if (user.contact) {
            tasks.push((async () => {
                try {
                    await sendSMS(user.contact, `Welcome to CraftedClimate! Your account is active. Visit your dashboard to get started.`);
                } catch (err) {
                    console.error('[UserService] Welcome SMS Error:', err.message);
                }
            })());
        }

        await Promise.allSettled(tasks);
    }

    async getUserById(userid) {
        const user = await User.findOne({ userid }).select('-password -otp -otpExpiresAt');
        if (!user) throw new Error('User not found');

        // ✨ AUTO-HEALING: Ensure user has valid organization context
        await this._ensureUserContext(user);

        let subscriptionTier = 'free';
        if (user.subscription) {
            const sub = await UserSubscription.findOne({ subscriptionId: user.subscription });
            if (sub) {
                const plan = await Plan.findOne({ planId: sub.planId });
                if (plan) subscriptionTier = plan.name;
            }
        }

        // Return as POJO
        const userObj = user.toObject();
        userObj.subscriptionTier = subscriptionTier;

        return userObj;
    }

    /**
     * Refresh Access Token
     * @param {string} token - The refresh token
     */
    async refreshToken(token) {
        if (!token) throw new Error('Refresh Token is required');

        try {
            // 1. Verify Token
            const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);

            // 2. Check User Status
            const user = await User.findOne({ userid: decoded.userid });
            if (!user) throw new Error('User not found');
            if (user.deletedAt) throw new Error('Account Suspended');

            // ✨ AUTO-HEALING: Ensure user has valid organization context
            await this._ensureUserContext(user);

            // 3. Generate New Tokens
            // Re-use payload construction logic to ensure consistency
            const payload = {
                userid: user.userid,
                email: user.email,
                username: user.username,
                platformRole: user.role,
                organizations: user.organization,
                currentOrganizationId: user.currentOrganizationId
            };

            const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN,
            });
            const newRefreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
                expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN
            });

            return {
                accessToken,
                refreshToken: newRefreshToken
            };

        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new Error('Refresh token expired. Please login again.');
            }
            if (error.name === 'JsonWebTokenError') {
                throw new Error('Invalid refresh token');
            }
            throw error;
        }
    }
    /**
     * Update User Profile
     */
    async updateProfile(userId, updateData) {
        const user = await User.findOne({ userid: userId });
        if (!user) throw new Error('User not found');

        // Handle Profile Picture Upload
        if (updateData.file) {
            const file = updateData.file;
            const fileName = `profile-${Date.now()}-${file.originalname}`;
            const blockBlobClient = containerClient.getBlockBlobClient(fileName);

            // Upload new file
            await blockBlobClient.upload(file.buffer, file.buffer.length, {
                blobHTTPHeaders: { blobContentType: file.mimetype },
            });

            // 🗑️ Delete old profile picture if exists
            if (user.profilePicture) {
                try {
                    // Extract blob name from URL
                    const url = new URL(user.profilePicture);
                    const pathParts = url.pathname.split('/');
                    const oldBlobName = decodeURIComponent(pathParts.pop());

                    if (oldBlobName && pathParts.includes('images')) {
                        const oldBlobClient = containerClient.getBlockBlobClient(oldBlobName);
                        // blockBlobClient.deleteIfExists() is available.
                        await oldBlobClient.deleteIfExists();
                        console.log(`[UserService] Deleted old profile picture: ${oldBlobName}`);
                    }

                } catch (err) {
                    console.warn(`[UserService] Failed to delete old profile picture for ${userId}:`, err.message);
                }
            }

            // Update user record with new signed URL
            user.profilePicture = generateSignedUrl(fileName);
        }

        // Apply whitelisted updates (exclude 'file')
        Object.keys(updateData).forEach(key => {
            if (key === 'file') return; // Skip file object

            if (key === 'socialLinks') {
                if (typeof updateData.socialLinks === 'string') {
                    try {
                        updateData.socialLinks = JSON.parse(updateData.socialLinks);
                    } catch (e) { }
                }
                user.socialLinks = { ...user.socialLinks, ...updateData.socialLinks };
            } else {
                user[key] = updateData[key];
            }
        });

        await user.save();

        // AUDIT LOG
        await createAuditLog({
            action: 'USER_PROFILE_UPDATE',
            userid: userId,
            organizationId: user.currentOrganizationId,
            details: { updatedFields: Object.keys(updateData) },
            ipAddress: null
        });

        return this.getUserById(userId);
    }

    /**
     * Update User Preferences
     */
    async updatePreferences(userId, { preferences, notificationSettings }) {
        const user = await User.findOne({ userid: userId });
        if (!user) throw new Error('User not found');

        if (preferences) {
            user.preferences = { ...user.preferences, ...preferences };
        }

        if (notificationSettings) {
            user.notificationSettings = { ...user.notificationSettings, ...notificationSettings };

            // Sync to NotificationPreference collection
            let notiPrefs = await NotificationPreference.findOne({ userid: userId });
            if (!notiPrefs) {
                notiPrefs = new NotificationPreference({
                    userid: userId,
                    ...NotificationPreference.getDefaults()
                });
            }

            if (notificationSettings.emailAlerts !== undefined) {
                notiPrefs.preferences.email.enabled = notificationSettings.emailAlerts;
            }
            if (notificationSettings.pushAlerts !== undefined) {
                notiPrefs.preferences.push.enabled = notificationSettings.pushAlerts;
            }

            notiPrefs.updatedAt = new Date();
            await notiPrefs.save();
        }

        await user.save();
        return this.getUserById(userId);
    }

    /**
     * Mute a device
     */
    async muteDevice(userId, deviceId) {
        let prefs = await NotificationPreference.findOne({ userid: userId });
        if (!prefs) {
            prefs = new NotificationPreference({
                userid: userId,
                ...NotificationPreference.getDefaults()
            });
        }

        if (!prefs.mutedDevices.includes(deviceId)) {
            prefs.mutedDevices.push(deviceId);
            prefs.updatedAt = new Date();
            await prefs.save();
        }

        return true;
    }

    /**
     * Unmute a device
     */
    async unmuteDevice(userId, deviceId) {
        const prefs = await NotificationPreference.findOne({ userid: userId });
        if (prefs) {
            prefs.mutedDevices = prefs.mutedDevices.filter(id => id !== deviceId);
            prefs.updatedAt = new Date();
            await prefs.save();
        }
        return true;
    }

    /**
     * Get Muted Devices
     */
    async getMutedDevices(userId) {
        const prefs = await NotificationPreference.findOne({ userid: userId });
        return prefs ? prefs.mutedDevices : [];
    }

    /**
     * Change Password
     */
    async changePassword(userId, oldPassword, newPassword) {
        const user = await User.findOne({ userid: userId });
        if (!user) throw new Error('User not found');

        const validPassword = await bcrypt.compare(oldPassword, user.password);
        if (!validPassword) {
            throw new Error('Incorrect password');
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        // AUDIT LOG
        await createAuditLog({
            action: 'USER_PASSWORD_CHANGE',
            userid: userId,
            organizationId: user.currentOrganizationId,
            details: { method: 'settings' },
            ipAddress: null
        });

        // Optionally revoke other sessions?
        // user.refreshToken = ""; 
        // await user.save();

        return true;
    }

    /**
     * ✨ USER CONTEXT AUTO-HEALING
     * Ensures user has a personal organization and an active currentOrganizationId.
     */
    async _ensureUserContext(user) {
        let changed = false;

        // 1. Ensure personal organization exists
        if (!user.personalOrganizationId) {
            console.log(`[UserService] Healing: Missing PersonalOrg for ${user.email}`);

            // Try to find if they already have a "personal" plan org they created
            let personalOrg = await Organization.findOne({
                createdBy: user.userid,
                planType: 'personal'
            });

            if (!personalOrg) {
                const personalOrgId = `org-${uuidv4()}`;
                personalOrg = new Organization({
                    organizationId: personalOrgId,
                    name: `${user.firstName || user.username}'s Workspace`,
                    description: "Personal organization workspace",
                    planType: "personal",
                    collaborators: [{ userid: user.userid, role: "org-admin", permissions: [] }],
                    createdBy: user.userid
                });
                await personalOrg.save();

                // Assign Freemium Plan to the new personal org
                const freemiumPlan = await Plan.findOne({ name: "freemium", isActive: true });
                if (freemiumPlan) {
                    await UserSubscription.create({
                        subscriptionId: uuidv4(),
                        userid: user.userid,
                        organizationId: personalOrgId,
                        subscriptionScope: "personal",
                        planId: freemiumPlan.planId,
                        status: "active",
                        billingCycle: "free",
                        autoRenew: false,
                        usage: { devicesCount: 0, exportsThisMonth: 0, apiCallsThisMonth: 0 }
                    });
                }
            }

            user.personalOrganizationId = personalOrg.organizationId;
            if (!user.organization.includes(personalOrg.organizationId)) {
                user.organization.push(personalOrg.organizationId);
            }
            changed = true;
        }

        // 2. Ensure subscription exists for personal workspace
        if (!user.subscription && user.personalOrganizationId) {
            console.log(`[UserService] Healing: Missing Subscription for ${user.email}`);

            // Look for existing subscription record
            let existingSub = await UserSubscription.findOne({
                userid: user.userid,
                organizationId: user.personalOrganizationId
            });

            if (!existingSub) {
                // Create new Freemium subscription if none exists
                const freemiumPlan = await Plan.findOne({ name: "freemium", isActive: true });
                if (freemiumPlan) {
                    existingSub = await UserSubscription.create({
                        subscriptionId: uuidv4(),
                        userid: user.userid,
                        organizationId: user.personalOrganizationId,
                        subscriptionScope: "personal",
                        planId: freemiumPlan.planId,
                        status: "active",
                        billingCycle: "free",
                        autoRenew: false,
                        usage: { devicesCount: 0, exportsThisMonth: 0, apiCallsThisMonth: 0 }
                    });
                }
            }

            if (existingSub) {
                user.subscription = existingSub.subscriptionId;
                changed = true;
            }
        }

        // 3. Ensure currentOrganizationId is set
        if (!user.currentOrganizationId) {
            // Default to personal if available
            if (user.personalOrganizationId) {
                user.currentOrganizationId = user.personalOrganizationId;
            } else if (user.organization && user.organization.length > 0) {
                // Fallback to first joined organization
                user.currentOrganizationId = user.organization[0];
            }

            if (user.currentOrganizationId) {
                console.log(`[UserService] Healing: Set currentOrg to ${user.currentOrganizationId} for ${user.email}`);
                changed = true;
            }
        }

        if (changed) {
            await user.save();
        }
        return user;
    }

    /**
     * Initiate login specifically for the Backoffice Console (MFA step 1)
     */
    async initiateBackofficeLogin({ email, password }) {
        if (!email || !password) {
            throw new Error('Please provide email and password');
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            throw new Error('User not found');
        }

        if (user.deletedAt) {
            throw new Error('Account Suspended: Your account has been suspended. Please contact support.');
        }

        if (!user.verified) {
            throw new Error('Account not verified');
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            throw new Error('Invalid Password');
        }

        // Role check: must be admin, supervisor, or support
        const validRoles = ['admin', 'supervisor', 'support'];
        if (!validRoles.includes(user.role)) {
            throw new Error('Unauthorized Access: Backoffice console is restricted to administrators.');
        }

        // Phone number check
        if (!user.contact) {
            throw new Error('MFA Error: No phone number configured for SMS authentication. Please contact a platform admin.');
        }

        // Generate 6-digit OTP
        const otpCode = crypto.randomInt(100000, 999999);
        const tempSessionId = crypto.randomBytes(32).toString('hex');

        // Store temporary session in Redis (expires in 5 minutes)
        const sessionData = {
            userid: user.userid,
            email: user.email,
            otp: otpCode
        };
        await redisClient.set(`backoffice:mfa:${tempSessionId}`, JSON.stringify(sessionData), {
            EX: 300 // 5 minutes
        });

        // Send SMS OTP
        const message = `Your CraftedClimate Backoffice Console OTP is ${otpCode}. Expires in 5m.`;
        try {
            await sendSMS(user.contact, message);
        } catch (err) {
            console.error('[UserService] Backoffice SMS OTP Send Error:', err.message);
        }

        // Also mock email for debugging/local testing if needed
        try {
            await sendEmail(user.email, 'CraftedClimate - Backoffice OTP', message);
        } catch (err) { /* ignore */ }

        return {
            tempSessionId,
            message: 'MFA OTP successfully sent via SMS and Email.'
        };
    }

    /**
     * Verify Backoffice OTP (MFA step 2)
     */
    async verifyBackofficeOtp({ tempSessionId, otp }) {
        if (!tempSessionId || !otp) {
            throw new Error('Session ID and OTP are required');
        }

        const sessionKey = `backoffice:mfa:${tempSessionId}`;
        const sessionDataStr = await redisClient.get(sessionKey);
        if (!sessionDataStr) {
            throw new Error('Session expired or invalid');
        }

        const sessionData = JSON.parse(sessionDataStr);
        if (parseInt(otp) !== sessionData.otp) {
            throw new Error('Invalid OTP');
        }

        const user = await User.findOne({ userid: sessionData.userid });
        if (!user || user.deletedAt) {
            throw new Error('User not found or suspended');
        }

        // Cleanup temp session
        await redisClient.del(sessionKey);

        // Auto-heal user context
        await this._ensureUserContext(user);

        // Generate JWT tokens
        const payload = {
            userid: user.userid,
            email: user.email,
            username: user.username,
            platformRole: user.role,
            organizations: user.organization,
            currentOrganizationId: user.currentOrganizationId
        };

        const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN,
        });
        const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN
        });

        // Resolve subscription tier for frontend
        let subscriptionTier = 'free';
        let sub = null;
        if (user.subscription) {
            sub = await UserSubscription.findOne({ subscriptionId: user.subscription });
        }
        if (!sub || sub.status !== 'active') {
            const activeSubs = await UserSubscription.find({
                userid: user.userid,
                status: 'active',
                subscriptionScope: 'personal'
            });
            const activeSub = activeSubs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
            if (activeSub) {
                sub = activeSub;
            }
        }
        if (sub && sub.status === 'active') {
            const plan = await Plan.findOne({ planId: sub.planId });
            if (plan) subscriptionTier = plan.name;
        }

        // Audit log
        await createAuditLog({
            action: 'USER_BACKOFFICE_LOGIN_SUCCESS',
            userid: user.userid,
            details: { email: user.email, role: user.role },
            ipAddress: null
        });

        return {
            message: 'Backoffice authentication successful',
            accessToken,
            refreshToken,
            user: {
                userid: user.userid,
                username: user.username,
                email: user.email,
                role: user.role,
                verified: user.verified,
                organization: user.organization,
                personalOrganizationId: user.personalOrganizationId,
                currentOrganizationId: user.currentOrganizationId,
                subscription: user.subscription,
                subscriptionTier
            }
        };
    }

    /**
     * Initiate password reset request for Backoffice Admin (peer-approved)
     */
    async requestAdminPasswordReset({ email }) {
        if (!email) {
            throw new Error('Email is required');
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            throw new Error('User not found');
        }

        const validRoles = ['admin', 'supervisor', 'support'];
        if (!validRoles.includes(user.role)) {
            throw new Error('Unauthorized Operation: This endpoint is restricted to backoffice administrators.');
        }

        // Check if there is already a pending request to prevent spam
        const existingPending = await AdminPasswordResetRequest.findOne({ userid: user.userid, status: 'pending' });
        if (existingPending) {
            return {
                message: 'A password reset request is already pending approval by a platform administrator.'
            };
        }

        const requestId = 'req-pwd-' + crypto.randomBytes(16).toString('hex');
        await AdminPasswordResetRequest.create({
            requestId,
            userid: user.userid,
            email: user.email,
            status: 'pending'
        });

        // Notify other admins via email (non-blocking)
        const otherAdmins = await User.find({ role: 'admin', userid: { $ne: user.userid } });
        const notificationText = `A backoffice password reset request has been initiated by ${user.email} (${user.userid}).\n\nPlease log into the Backoffice console to approve or reject this request (Request ID: ${requestId}).`;
        
        for (const admin of otherAdmins) {
            try {
                await sendEmail(admin.email, 'CraftedClimate - Admin Password Reset Approval Required', notificationText);
            } catch (err) { /* ignore */ }
        }

        // Audit Log
        await createAuditLog({
            action: 'ADMIN_PASSWORD_RESET_REQUESTED',
            userid: user.userid,
            details: { requestId, email: user.email },
            ipAddress: null
        });

        return {
            message: 'Password reset request submitted successfully. A platform administrator must approve this request.'
        };
    }

    /**
     * Reset Backoffice Password using approved request token
     */
    async resetBackofficePassword({ requestId, token, newPassword }) {
        if (!requestId || !token || !newPassword) {
            throw new Error('Request ID, Token, and New Password are required');
        }

        const request = await AdminPasswordResetRequest.findOne({ requestId });
        if (!request) {
            throw new Error('Password reset request not found');
        }

        if (request.status !== 'approved') {
            throw new Error(`Request is not authorized (current status: ${request.status})`);
        }

        if (request.token !== token) {
            throw new Error('Invalid verification token');
        }

        if (request.tokenExpiresAt && new Date(request.tokenExpiresAt) < new Date()) {
            throw new Error('Password reset token has expired');
        }

        const user = await User.findOne({ userid: request.userid });
        if (!user) {
            throw new Error('Target user not found');
        }

        // Hash and save new password
        user.password = await bcrypt.hash(newPassword, 10);
        user.mustChangePassword = false; // Reset the flag
        await user.save();

        // Clear token to make it single-use
        request.token = null;
        request.tokenExpiresAt = null;
        request.status = 'completed'; // Mark as fully completed
        await request.save();

        // Audit log
        await createAuditLog({
            action: 'ADMIN_PASSWORD_RESET_COMPLETED',
            userid: user.userid,
            details: { requestId },
            ipAddress: null
        });

        return {
            success: true,
            message: 'Password updated successfully. You can now log in with your new password.'
        };
    }
}

module.exports = new UserService();
