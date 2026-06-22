const express = require('express');
const router = express.Router();
const userController = require('./user.controller');
const upload = require('../../utils/fileUpload');
const { otpLimiter } = require('../../middleware/rateLimiter');

// Routes (Cleaned up from original)

/**
 * @swagger
 * /api/auth/signup:
 *   post:
 *     tags: [Authentication]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 example: "arnold_sylvian"
 *               email:
 *                 type: string
 *                 example: "developer@craftedclimate.com"
 *                 format: email
 *               password:
 *                 type: string
 *                 example: "Password123!"
 *                 format: password
 *               firstName:
 *                 type: string
 *                 example: "Arnold"
 *               lastName:
 *                 type: string
 *                 example: "Sylvian"
 *               country:
 *                 type: string
 *                 example: "Ghana"
 *                 default: Ghana
 *               contact:
 *                 type: string
 *                 example: "+233240000000"
 *               invitationId:
 *                 type: string
 *                 example: "invitationId_example"
 *               profilePicture:
 *                 type: string
 *                 example: "properties_example"
 *                 format: binary
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 */
router.post('/signup', otpLimiter, upload.single('profilePicture'), userController.signup);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Log in a user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: "developer@craftedclimate.com"
 *                 format: email
 *               password:
 *                 type: string
 *                 example: "properties_example"
 *                 format: password
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', userController.login);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     tags: [Authentication]
 *     summary: Log out the current user
 *     description: |
 *       Destroys the active browser session and clears the `cc.sid` cookie.
 *       Safe to call from both browser (cookie) and token-based (JWT/API key) clients.
 *       Token-based clients should also discard their stored tokens client-side.
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
router.post('/logout', userController.logout);


/**
 * @swagger
 * /api/auth/verify-otp:
 *   post:
 *     tags: [Authentication]
 *     summary: Verify User OTP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *                 example: "developer@craftedclimate.com"
 *                 format: email
 *               otp:
 *                 type: string
 *                 example: "properties_example"
 *                 description: OTP Code
 *     responses:
 *       200:
 *         description: Account verified successfully
 *       400:
 *         description: Invalid OTP or expired
 */
router.post('/verify-otp', otpLimiter, userController.verifyOtp);

/**
 * @swagger
 * /api/auth/backoffice/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Initiate Backoffice Admin Login (MFA Step 1)
 *     description: Authenticate administrative credentials (admin/supervisor/support) and trigger SMS OTP.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: "admin@example.com"
 *                 format: email
 *               password:
 *                 type: string
 *                 example: "Password123!"
 *                 format: password
 *     responses:
 *       200:
 *         description: Login credentials verified, OTP sent via SMS
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Unauthorized role
 */
router.post('/backoffice/login', userController.backofficeLogin);

/**
 * @swagger
 * /api/auth/backoffice/verify-otp:
 *   post:
 *     tags: [Authentication]
 *     summary: Verify Backoffice OTP (MFA Step 2)
 *     description: Verify the SMS OTP code and generate final JWT tokens.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tempSessionId
 *               - otp
 *             properties:
 *               tempSessionId:
 *                 type: string
 *                 example: "a1b2c3d4e5f6..."
 *                 description: The temporary session reference returned by the login step
 *               otp:
 *                 type: string
 *                 example: "123456"
 *                 description: 6-digit SMS OTP code
 *     responses:
 *       200:
 *         description: Authentication successful, tokens generated
 *       400:
 *         description: Invalid OTP or session expired
 */
router.post('/backoffice/verify-otp', otpLimiter, userController.backofficeVerifyOtp);

/**
 * @swagger
 * /api/auth/backoffice/forgot-password:
 *   post:
 *     tags: [Authentication]
 *     summary: Initiate Backoffice Admin Password Reset Request
 *     description: Submits a password reset request which requires peer-approval by another Platform Administrator.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: "admin@example.com"
 *                 format: email
 *     responses:
 *       200:
 *         description: Reset request successfully submitted for approval
 *       403:
 *         description: Restrictive roles only
 *       404:
 *         description: User not found
 */
router.post('/backoffice/forgot-password', otpLimiter, userController.requestAdminPasswordReset);

/**
 * @swagger
 * /api/auth/backoffice/reset-password:
 *   post:
 *     tags: [Authentication]
 *     summary: Complete Backoffice Admin Password Reset
 *     description: Reset backoffice user's password using the single-use token from the approved request.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - requestId
 *               - token
 *               - newPassword
 *             properties:
 *               requestId:
 *                 type: string
 *                 example: "req-pwd-12345"
 *                 description: The password reset request ID
 *               token:
 *                 type: string
 *                 example: "token-uuid-12345"
 *                 description: The reset token sent via email
 *               newPassword:
 *                 type: string
 *                 example: "NewPassword123!"
 *                 format: password
 *                 description: The new password to set
 *     responses:
 *       200:
 *         description: Password updated successfully
 *       400:
 *         description: Invalid parameters, request not approved, expired or incorrect token
 *       404:
 *         description: Reset request or target user not found
 */
router.post('/backoffice/reset-password', otpLimiter, userController.backofficeResetPassword);

/**
 * @swagger
 * /api/auth/resend-otp:
 *   post:
 *     tags: [Authentication]
 *     summary: Resend verification OTP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: "properties_example"
 *                 format: email
 *     responses:
 *       200:
 *         description: OTP resent successfully
 *       400:
 *         description: Wait time required or user verified
 */
router.post('/resend-otp', otpLimiter, userController.resendOtp);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     tags: [Authentication]
 *     summary: Initiate password reset
 *     description: Generates an OTP and sends it to user's registered email and phone.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: "properties_example"
 *                 format: email
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *       404:
 *         description: User not found
 */
router.post('/forgot-password', otpLimiter, userController.forgotPassword);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     tags: [Authentication]
 *     summary: Reset password using OTP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *               - newPassword
 *             properties:
 *               email:
 *                 type: string
 *                 example: "developer@craftedclimate.com"
 *                 format: email
 *               otp:
 *                 type: string
 *                 example: "123456"
 *               newPassword:
 *                 type: string
 *                 example: "properties_example"
 *                 format: password
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid or expired OTP
 */
router.post('/reset-password', otpLimiter, userController.resetPassword);

/**
 * @swagger
 * /api/auth/refresh-token:
 *   post:
 *     tags: [Authentication]
 *     summary: Refresh Access Token
 *     description: Exchange a valid refresh token for a new access token pair.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: "properties_example"
 *     responses:
 *       200:
 *         description: New tokens issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   example: "accessToken_example"
 *                 refreshToken:
 *                   type: string
 *                   example: "properties_example"
 *       401:
 *         description: Invalid or expired refresh token
 *       403:
 *         description: Account suspended
 */
router.post('/refresh-token', userController.refreshToken);

// Add other user routes if they existed in the original file...
// Looking at original routes/user/user.js, it ONLY had signup and login in the refactored version I made earlier.
// If there were other routes (like profile, update), they should be added here.
// I will assume for this refactor I only migrated what was in context.

const authenticateToken = require('../../middleware/bearermiddleware');

// ... (existing routes)

/**
 * @swagger
 * /api/user/profile:
 *   get:
 *     tags: [User Settings]
 *     summary: Get user profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "User profile retrieved successfully" }
 *                 user: { $ref: '#/components/schemas/User' }
 *       401:
 *         description: Unauthorized
 */
router.get('/profile', authenticateToken, userController.getProfile);
/**
 * @swagger
 * /api/user/profile:
 *   patch:
 *     tags: [User Settings]
 *     summary: Update user profile details
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               profilePicture:
 *                 type: string
 *                 example: "profilePicture_example"
 *                 format: binary
 *               firstName: { type: string, example: "Jane" }
 *               lastName: { type: string, example: "Doe" }
 *               contact: { type: string, example: "233501234567" }
 *               jobTitle: { type: string, example: "Senior Environmental Engineer" }
 *               bio: { type: string, example: "Passionate about climate action and data." }
 *               socialLinks:
 *                  type: object
 *                  properties:
 *                    linkedin: { type: string, example: "https://linkedin.com/in/janedoe" }
 *                    twitter: { type: string, example: "https://twitter.com/janedoe" }
 *                    website: { type: string, example: "https://janedoe.com" }
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Profile updated successfully" }
 *                 user: { $ref: '#/components/schemas/User' }
 */
router.patch('/profile', authenticateToken, upload.single('profilePicture'), userController.updateProfile);

/**
 * @swagger
 * /api/user/preferences:
 *   patch:
 *     tags: [User Settings]
 *     summary: Update user preferences and notification settings
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               preferences:
 *                 type: object
 *                 properties:
 *                   theme: { type: string, enum: ['light', 'dark', 'system'], example: "dark" }
 *                   language: { type: string, example: "en" }
 *                   dashboardLayout: { type: string, enum: ['standard', 'compact'], example: "compact" }
 *               notificationSettings:
 *                 type: object
 *                 properties:
 *                   emailAlerts: { type: boolean, example: true }
 *                   pushAlerts: { type: boolean, example: false }
 *                   marketingEmails: { type: boolean, example: false }
 *     responses:
 *       200:
 *         description: Preferences updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Preferences updated successfully" }
 *                 user: { $ref: '#/components/schemas/User' }
 */
router.patch('/preferences', authenticateToken, userController.updatePreferences);

/**
 * @swagger
 * /api/user/security/password:
 *   patch:
 *     tags: [User Settings]
 *     summary: Change user password
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oldPassword, newPassword]
 *             properties:
 *               oldPassword: { type: string, format: password, example: "oldSecret123" }
 *               newPassword: { type: string, format: password, example: "newSecret456" }
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Password changed successfully" }
 *       400:
 *         description: Validation error (e.g. same password)
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { message: { type: string, example: "New password cannot be the same as the old password" } } }
 *       401:
 *         description: Incorrect old password
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { message: { type: string, example: "Incorrect password" } } }
 */
router.patch('/security/password', authenticateToken, userController.changePassword);

/**
 * @swagger
 * /api/user/devices/muted:
 *   get:
 *     tags: [User Settings]
 *     summary: Get list of muted devices
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of muted device IDs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mutedDevices: { type: array, example: ["example_value"], items: { type: string } }
 */
router.get('/devices/muted', authenticateToken, userController.getMutedDevices);

/**
 * @swagger
 * /api/user/devices/{deviceId}/mute:
 *   post:
 *     tags: [User Settings]
 *     summary: Mute a specific device
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema: { type: string, example: "device-starter-uuid" }
 *     responses:
 *       200: { description: Device muted successfully }
 */
router.post('/devices/:deviceId/mute', authenticateToken, userController.muteDevice);

/**
 * @swagger
 * /api/user/devices/{deviceId}/unmute:
 *   post:
 *     tags: [User Settings]
 *     summary: Unmute a specific device
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema: { type: string, example: "device-starter-uuid" }
 *     responses:
 *       200: { description: Device unmuted successfully }
 */
router.post('/devices/:deviceId/unmute', authenticateToken, userController.unmuteDevice);

module.exports = router;
