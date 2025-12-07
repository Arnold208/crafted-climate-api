const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const User = require('../../model/user/userModel');
const Invitation = require('../../model/invitation/invitationModel');
const Plan = require('../../model/subscriptions/Plan');
const UserSubscription = require('../../model/subscriptions/UserSubscription');
const Organization = require('../../model/organization/organizationModel'); // <-- adjust path if different

const { sendSMS } = require('../../config/sms/sms');
const { sendEmail } = require('../../config/mail/nodemailer');
const { upload, containerClient, generateSignedUrl } = require('../../config/storage/storage');
const { otpLimiter } = require('../../middleware/user/rateLimiter');
const { generateuserid } = require('../../utils/idGenerator');
const authenticateToken = require('../../middleware/user/bearermiddleware');
const authorizeRoles = require('../../middleware/user/rbacMiddleware');
// const verifyApiKey = require('../../middleware/user/apiKeymiddleware'); // only if needed elsewhere

function normalizeContact(contact) {
  if (!contact) return contact;
  contact = contact.trim();
  if (contact.startsWith('0')) {
    return '233' + contact.slice(1);
  }
  return contact.replace(/^\+/, '');
}

/**
 * @swagger
 * /api/auth/signup:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Register a new user
 *     description: Allows a new user to sign up, upload profile picture, and sends OTP to phone number for verification. If an invitationId is provided, the user is also attached to an organization with the specified role.
 *     consumes:
 *       - multipart/form-data
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
 *               - contact
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               contact:
 *                 type: string
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               invitationId:
 *                 type: string
 *               profilePicture:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post(
  '/signup',
  otpLimiter,
  upload.single('profilePicture'),
  async (req, res) => {
    let { username, email, password, invitationId, contact, firstName, lastName } = req.body;

    if (!username || !email || !password) {
      return res.status(400).send({ message: 'Please provide username, email, and password' });
    }

    email = email.trim().replace(/\s+/g, '');
    contact = normalizeContact(contact);

    try {
      // ---------------------------------------------------
      // Check for existing users
      // ---------------------------------------------------
      if (await User.findOne({ email })) {
        return res.status(400).send({ message: 'User with this email already exists' });
      }

      if (contact && await User.findOne({ contact })) {
        return res.status(400).send({ message: 'User with this contact number already exists' });
      }

      // ---------------------------------------------------
      // Invitation handling (ORG invites)
      // ---------------------------------------------------
      let invitation = null;
      let systemRole = 'user';   // system-wide role
      let orgRoles = {};         // { orgid: 'editor' }

      if (invitationId) {
        invitation = await Invitation.findOne({
          invitationId,
          email,
          accepted: false,
          expiresAt: { $gt: new Date() }
        });

        if (!invitation) {
          return res.status(400).send({ message: 'Invalid or expired invitation' });
        }

        // System role remains "user"
        // Attach org role
        orgRoles[invitation.organizationId] = invitation.accessLevel || 'editor';
      }

      // ---------------------------------------------------
      // Create user
      // ---------------------------------------------------
      const otpCode = Math.floor(100000 + Math.random() * 900000);
      const hashedPassword = await bcrypt.hash(password, 10);
      const userid = generateuserid();

      // Profile picture upload (Azure Blob)
      let profilePictureUrl = '';
      if (req.file) {
        const fileName = `profile-${Date.now()}-${req.file.originalname}`;
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);
        await blockBlobClient.upload(req.file.buffer, req.file.buffer.length, {
          blobHTTPHeaders: { blobContentType: req.file.mimetype }
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
        role: systemRole,
        orgRoles,        // map of orgid -> orgRole
        organizations: invitation ? [invitation.organizationId] : [],
        devices: [],
        profilePicture: profilePictureUrl,
        otp: otpCode,
        otpExpiresAt: Date.now() + 15 * 60 * 1000,
        lastOtpSentAt: new Date(),
        verified: false
      });

      await newUser.save();

      // ---------------------------------------------------
      // Auto-assign FREEMIUM personal subscription
      // ---------------------------------------------------
      try {
        const freemiumPlan = await Plan.findOne({ name: 'freemium', isActive: true });

        if (!freemiumPlan) {
          console.error('❌ Freemium plan not found.');
        } else {
          await UserSubscription.create({
            subscriptionId: uuidv4(),
            userid,
            planId: freemiumPlan.planId,
            billingCycle: 'free',
            status: 'active',
            startDate: new Date(),
            autoRenew: false,
            usage: {
              devicesCount: 0,
              exportsThisMonth: 0,
              apiCallsThisMonth: 0
            }
          });

          console.log(`✔ Auto-assigned freemium subscription → ${userid}`);
        }
      } catch (err) {
        console.error('Subscription auto-assign error:', err);
      }

      // ---------------------------------------------------
      // If signup was through invitation → attach to Organization
      // ---------------------------------------------------
      if (invitation) {
        invitation.accepted = true;
        await invitation.save();

        const org = await Organization.findOne({ orgid: invitation.organizationId });
        if (org) {
          org.collaborators.push({
            userid,
            role: invitation.accessLevel || 'editor',
            permissions: []
          });
          await org.save();
        }
      }

      // ---------------------------------------------------
      // Send OTP via SMS
      // ---------------------------------------------------
      if (contact) {
        await sendSMS(contact, `Your CraftedClimate OTP is ${otpCode}. It expires in 15 minutes.`);
      }

      return res.status(201).send({
        message: 'User registered successfully',
        userid,
        verified: newUser.verified
      });
    } catch (error) {
      console.log(error);
      return res.status(500).send({ message: 'Internal server error', error: error.message });
    }
  }
);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Log in a user
 *     description: Authenticates a user by email and password.
 *     consumes:
 *       - application/json
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
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Authentication successful
 *       400:
 *         description: Missing email or password
 *       401:
 *         description: Invalid credentials or unverified account
 *       500:
 *         description: Internal server error
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).send({ message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(401).send({ message: 'Invalid email or password' });

    if (!user.verified) {
      return res.status(401).send({
        message: 'Account not verified. Check your inbox for OTP.'
      });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).send({ message: 'Invalid password' });

    const payload = {
      userid: user.userid,
      email: user.email,
      role: user.role,
      orgRoles: user.orgRoles || {},
      username: user.username
    };

    const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '60m' });
    const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET);

    return res.status(200).send({
      accessToken,
      refreshToken,
      userid: user.userid,
      email: user.email,
      username: user.username,
      role: user.role,
      orgRoles: user.orgRoles || {}
    });
  } catch (error) {
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
});

/**
 * @swagger
 * /api/auth/refresh-token:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Refresh access and refresh tokens
 *     description: Exchange a valid refresh token for a new access token and refresh token.
 *     consumes:
 *       - application/json
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
 *     responses:
 *       200:
 *         description: Tokens refreshed successfully
 *       400:
 *         description: Missing refreshToken
 *       401:
 *         description: Invalid or expired refresh token
 *       500:
 *         description: Server error
 */
router.post('/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) return res.status(400).send({ message: 'refreshToken is required' });

  try {
    const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    const user = await User.findOne({ userid: payload.userid });
    if (!user) return res.status(401).send({ message: 'User not found for token' });

    const newPayload = {
      userid: user.userid,
      email: user.email,
      role: user.role,
      orgRoles: user.orgRoles || {},
      username: user.username
    };

    const newAccess = jwt.sign(newPayload, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '60m' });
    const newRefresh = jwt.sign(newPayload, process.env.REFRESH_TOKEN_SECRET);

    return res.status(200).send({
      accessToken: newAccess,
      refreshToken: newRefresh,
      userid: user.userid,
      email: user.email,
      username: user.username,
      role: user.role,
      orgRoles: user.orgRoles || {}
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
      return res.status(401).send({ message: 'Invalid or expired refresh token' });
    }
    return res.status(500).send({ message: 'Server error', error: err.message });
  }
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags:
 *       - Authentication
 *     summary: Get current authenticated user
 *     description: Returns the currently authenticated user's profile and org roles.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ userid: req.user.userid }).select('-password -otp');
    if (!user) {
      return res.status(404).send({ message: 'User not found' });
    }

    return res.status(200).send(user);
  } catch (error) {
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
});

/**
 * @swagger
 * /api/auth/verify-otp-signup:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Verify OTP for Signup
 *     description: Verifies the OTP sent to the user's contact during signup and marks the user as verified.
 *     consumes:
 *       - application/json
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
 *               otp:
 *                 type: number
 *     responses:
 *       200:
 *         description: OTP verified and user activated
 *       400:
 *         description: Invalid or expired OTP
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post('/verify-otp-signup', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).send({ message: 'Please provide a valid email and OTP' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).send({ message: 'User not found' });
    }

    const otpNumber = parseInt(otp, 10);
    if (user.otp !== otpNumber) {
      return res.status(400).send({ message: 'Invalid OTP' });
    }

    if (new Date() > user.otpExpiresAt) {
      return res.status(400).send({ message: 'Expired OTP' });
    }

    user.verified = true;
    user.otp = undefined;
    user.otpExpiresAt = undefined;
    await user.save();

    const emailContent = `
      <p>Hi ${user.username},</p>
      <p>Welcome to <strong>CraftedClimate</strong>! Your account has been successfully created and verified.</p>
      <p><a href="https://console.craftedclimate.co" target="_blank">Go to Dashboard</a></p>
      <p>Thank you for joining us.</p>
      <p>The CraftedClimate Team</p>
    `;

    await sendEmail(user.email, 'Your CraftedClimate Account has been verified.', emailContent);

    res.status(200).send({ message: 'User account verified successfully' });
  } catch (error) {
    res.status(500).send({ message: 'Internal server error', error: error.message });
  }
});

/**
 * @swagger
 * /api/auth/resend-otp:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Resend OTP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               contact:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP resent successfully
 *       400:
 *         description: Too soon to resend
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.post('/resend-otp', otpLimiter, async (req, res) => {
  const { contact } = req.body;
  if (!contact) return res.status(400).send({ message: 'Contact is required' });

  try {
    const normalizedContact = normalizeContact(contact);
    const user = await User.findOne({ contact: normalizedContact });
    if (!user) return res.status(404).send({ message: 'User not found' });

    const now = new Date();
    const lastSent = user.lastOtpSentAt || new Date(0);
    if (now - lastSent < 3 * 60 * 1000) {
      return res.status(400).send({ message: 'Please wait 3 minutes before requesting another OTP.' });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000);
    user.otp = otpCode;
    user.otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    user.lastOtpSentAt = now;
    await user.save();

    await sendSMS(user.contact, `Your CraftedClimate OTP is ${otpCode}. It expires in 15 minutes.`);
    res.status(200).send({ message: 'OTP resent successfully' });
  } catch (error) {
    res.status(500).send({ message: 'Internal server error', error: error.message });
  }
});

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Request password reset OTP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               contact:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP sent to user's contact
 *       400:
 *         description: Missing contact or email
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.post('/forgot-password', otpLimiter, async (req, res) => {
  const { email, contact } = req.body;

  if (!email && !contact) {
    return res.status(400).send({ message: 'Please provide either email or contact' });
  }

  try {
    const query = email ? { email } : { contact: normalizeContact(contact) };
    const user = await User.findOne(query);

    if (!user) return res.status(404).send({ message: 'User not found' });

    const now = new Date();
    const lastSent = user.lastOtpSentAt || new Date(0);
    if (now - lastSent < 3 * 60 * 1000) {
      return res.status(400).send({ message: 'Please wait 3 minutes before requesting another OTP' });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000);
    user.otp = otpCode;
    user.otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    user.lastOtpSentAt = now;
    await user.save();

    await sendSMS(user.contact, `Your CraftedClimate OTP for password reset is ${otpCode}. It expires in 15 minutes.`);
    res.status(200).send({ message: 'OTP sent to your phone number' });
  } catch (error) {
    res.status(500).send({ message: 'Internal server error', error: error.message });
  }
});

/**
 * @swagger
 * /api/auth/verify-otp-reset-password:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Verify OTP and reset password
 *     description: Verifies the OTP sent to the user's contact or email and allows them to reset their password.
 *     consumes:
 *       - application/json
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
 *               otp:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: User not found or invalid/expired OTP
 *       500:
 *         description: Internal server error
 */
router.post('/verify-otp-reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.status(400).send({ message: 'Please provide email, OTP, and new password' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).send({ message: 'User not found' });
    }

    const otpNumber = parseInt(otp, 10);

    if (user.otp !== otpNumber) {
      return res.status(400).send({ message: 'Invalid OTP' });
    }

    if (new Date() > user.otpExpiresAt) {
      return res.status(400).send({ message: 'Expired OTP' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.otp = undefined;
    user.otpExpiresAt = undefined;
    await user.save();

    const emailContent = `
      <p>Hi ${user.username},</p>
      <p>Your password has been successfully reset for your <strong>CraftedClimate</strong> account.</p>
      <p>If you did not request this change, please contact support immediately.</p>
      <p><a href="https://console.craftedclimate.co" target="_blank">Go to Dashboard</a></p>
      <p>— The CraftedClimate Team</p>
    `;

    await sendEmail(user.email, 'Your CraftedClimate Password Was Reset', emailContent);
    res.status(200).send({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).send({ message: 'Internal server error', error: error.message });
  }
});

/**
 * @swagger
 * /api/user/user-info:
 *   get:
 *     tags:
 *       - Users
 *     summary: Retrieve user information
 *     description: >
 *       - If email or userid is provided, returns that specific user (admin/superadmin or the user themselves).
 *       - If neither is provided, returns all users (admin/superadmin only).
 *     parameters:
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *       - in: query
 *         name: userid
 *         schema:
 *           type: string
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User information retrieved successfully
 *       404:
 *         description: User not found
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.get('/user-info', authenticateToken, async (req, res) => {
  const { email, userid } = req.query;

  try {
    // If no filters → must be admin/superadmin
    if (!email && !userid) {
      if (!['admin', 'superadmin'].includes(req.user.role)) {
        return res.status(403).send({ message: 'Access denied. Admin only.' });
      }
      const users = await User.find({}).select('-password -otp');
      if (!users.length) return res.status(404).send({ message: 'No users found' });
      return res.status(200).send(users);
    }

    // If specific user
    let query = {};
    if (email) query.email = email;
    if (userid) query.userid = userid;

    const users = await User.find(query).select('-password -otp');
    if (!users.length) {
      return res.status(404).send({ message: 'User not found' });
    }

    const target = users[0];

    // If requester is not the same user → require admin/superadmin
    if (target.userid !== req.user.userid && !['admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).send({ message: 'Forbidden' });
    }

    return res.status(200).send(users);
  } catch (error) {
    res.status(500).send({ message: 'Error fetching user(s)', error: error.message });
  }
});

/**
 * @swagger
 * /api/user/update-user/{userid}:
 *   put:
 *     tags:
 *       - Users
 *     summary: Update a user's information
 *     description: >
 *       - A user can update their own profile.
 *       - System admin/superadmin can update any user.
 *       - In future, org owners/admins can update org members (if enforced).
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - name: userid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *               contact:
 *                 type: string
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               profilePicture:
 *                 type: string
 *                 format: binary
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User updated successfully
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.put(
  '/update-user/:userid',
  authenticateToken,
  upload.single('profilePicture'),
  async (req, res) => {
    const { userid } = req.params;
    const updateData = req.body;

    try {
      // Authorization:
      // - Self
      // - admin/superadmin
      if (req.user.userid !== userid && !['admin', 'superadmin'].includes(req.user.role)) {
        return res.status(403).send({ message: 'Forbidden: you cannot update this user.' });
      }

      // Normalize contact if present
      if (updateData.contact) {
        updateData.contact = normalizeContact(updateData.contact);
      }

      // If new profile image is uploaded
      if (req.file) {
        const fileName = `profile-${Date.now()}-${req.file.originalname}`;
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);

        await blockBlobClient.upload(req.file.buffer, req.file.buffer.length, {
          blobHTTPHeaders: { blobContentType: req.file.mimetype }
        });

        const profileUrl = generateSignedUrl(fileName);
        updateData.profilePicture = profileUrl;
      }

      const updatedUser = await User.findOneAndUpdate(
        { userid },
        updateData,
        { new: true }
      ).select('-password -otp');

      if (!updatedUser) {
        return res.status(404).send({ message: 'User not found' });
      }

      res.status(200).send({
        message: 'User updated successfully',
        user: updatedUser
      });
    } catch (error) {
      res.status(500).send({ message: 'Internal server error', error: error.message });
    }
  }
);

/**
 * @swagger
 * /api/user/delete-user/{userid}:
 *   delete:
 *     tags:
 *       - Users
 *     summary: Delete a user
 *     description: >
 *       Delete a user account. Only system admin/superadmin can perform this action.
 *     parameters:
 *       - name: userid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       404:
 *         description: User not found
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */
router.delete(
  '/delete-user/:userid',
  authenticateToken,
  authorizeRoles('admin', 'superadmin'),
  async (req, res) => {
    const { userid } = req.params;

    try {
      const deletedUser = await User.findOneAndDelete({ userid });
      if (!deletedUser) {
        return res.status(404).send({ message: 'User not found' });
      }

      res.status(200).send({ message: 'User deleted successfully' });
    } catch (error) {
      res.status(500).send({ message: 'Internal server error', error: error.message });
    }
  }
);

module.exports = router;
