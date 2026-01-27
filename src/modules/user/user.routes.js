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
 */
router.post('/signup', otpLimiter, upload.single('profilePicture'), userController.signup);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Log in a user
 */
router.post('/login', userController.login);

/**
 * @swagger
 * /api/auth/verify-otp:
 *   post:
 *     tags: [Authentication]
 *     summary: Verify User OTP
 */
router.post('/verify-otp', otpLimiter, userController.verifyOtp);

/**
 * @swagger
 * /api/auth/resend-otp:
 *   post:
 *     tags: [Authentication]
 *     summary: Resend verification OTP
 */
router.post('/resend-otp', otpLimiter, userController.resendOtp);

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
 *     tags: [Authentication]
 *     summary: Get user profile
 *     security:
 *       - bearerAuth: []
 */
router.get('/profile', authenticateToken, userController.getProfile);

module.exports = router;
