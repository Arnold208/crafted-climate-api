const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const nanoid = require('nanoid')
const User = require('../../model/user/userModel');
const jwt = require('jsonwebtoken');
const authenticateToken = require('../../middleware/bearermiddleware');
const Invitation = require('../../model/invitation/invitationModel');
const rateLimit = require('express-rate-limit');
// const { sendEmail } = require('../../mail-service/nodemailer');
const { sendSMS } = require('../../config/sms/sms');
const { sendEmail } = require('../../config/mail/nodemailer');

const { upload, containerClient, generateSignedUrl } = require('../../config/storage/storage');
const { otpLimiter } = require('../../middleware/rateLimiter');
const { generateUserId } = require('../../utils/idGenerator');
const authorizeRoles = require('../../middleware/rbacMiddleware');
const verifyApiKey = require('../../middleware/apiKeymiddleware');

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
 *     description: Allows a new user to sign up, upload profile picture, and sends OTP to phone number for verification.
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

router.post('/signup', otpLimiter, upload.single('profilePicture'), async (req, res) => {
    let { username, email, password, invitationId, contact, firstName, lastName } = req.body;

    if (!username || !email || !password) {
        return res.status(400).send({ message: 'Please provide username, email, and password' });
    }

    email = email.trim().replace(/\s+/g, '');
    contact = normalizeContact(contact);

    try {
        const existingEmailUser = await User.findOne({ email });
        if (existingEmailUser) {
            return res.status(400).send({ message: 'User with this email already exists' });
        }

        const existingContactUser = await User.findOne({ contact });
        if (existingContactUser) {
            return res.status(400).send({ message: 'User with this contact number already exists' });
        }

        let invitation;
        let role = 'user';
        let devices = [];

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
            role = 'supervisor';
            if (invitation.deviceId) {
                devices.push({ deviceId: invitsation.deviceId, accessType: 'invited' });
            }
        }

        const otpCode = Math.floor(100000 + Math.random() * 900000);
        const hashedPassword = await bcrypt.hash(password, 10);
        const userid = generateUserId();

        let profilePictureUrl = '';
        if (req.file) {
            const fileName = `profile-${Date.now()}-${req.file.originalname}`;
            const blockBlobClient = containerClient.getBlockBlobClient(fileName);
            await blockBlobClient.upload(req.file.buffer, req.file.buffer.length, {
                blobHTTPHeaders: { blobContentType: req.file.mimetype },
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
            role,
            devices,
            profilePicture: profilePictureUrl,
            otp: otpCode,
            otpExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
            lastOtpSentAt: new Date(),
        });

        await newUser.save();

        if (invitation) {
            invitation.accepted = true;
            await invitation.save();

            const organization = await Organization.findOne({ organizationId: invitation.organizationId });
            if (organization) {
                organization.collaborators.push({
                    userId: userid,
                    accessLevel: invitation.accessLevel || 'MODERATOR',
                    permissions: []
                });
                await organization.save();

                newUser.organization.push(organization.organizationId);
                newUser.deployments = [...new Set([...newUser.deployments, ...organization.deployments])];
                await newUser.save();
            }
        }

        await sendSMS(contact, `Your CraftedClimate OTP is ${otpCode}. It expires in 15 minutes.`);

        res.status(201).send({ message: 'User registered successfully', userid, verified: newUser.verified });
    } catch (error) {
        console.log(error);
        res.status(500).send({ message: 'Internal server error', error: error.message });
    }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Log in a user
 *     description: Authenticates a user by their email and password.
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
 *                 description: The user's email address.
 *                 example: "user@example.com"
 *               password:
 *                 type: string
 *                 description: The user's password.
 *                 example: "password123"
 *     responses:
 *       '200':
 *         description: Authentication successful.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   description: JWT access token for authenticated sessions.
 *                 refreshToken:
 *                   type: string
 *                   description: JWT refresh token to obtain new access tokens.
 *                 userid:
 *                   type: string
 *                   description: Unique identifier for the user.
 *       '400':
 *         description: Bad request due to missing email or password.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Error message detailing the missing fields.
 *       '401':
 *         description: Unauthorized due to invalid login credentials or unverified email.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Error message indicating incorrect email, password, or unverified email.
 *       '500':
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: General error message for server-side issues.
 *                 error:
 *                   type: string
 *                   description: Detailed error information.
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).send({ message: 'Please provide email and password' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).send({ message: 'User not found' });
        }

        if (!user.verified) {
            return res.status(401).send({
                message: 'Account not verified. Please check your inbox for OTP to verify your account.',
            });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).send({ message: 'Invalid Password' });
        }

        const payload = {
            userId: user._id,
            role: user.role,
            userid: user.userid,
            email: user.email,
            username: user.username,
        };

        const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
            expiresIn: '60m',
        });
        const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET);

        res.status(200).send({
            accessToken,
            refreshToken,
            userid: user.userid,
            email: user.email,
            username: user.username,
            role: user.role,
        });
    } catch (error) {
        res.status(500).send({ message: 'Internal server error', error: error.message });
    }
});

/**
 * @swagger
 * /api/auth/verify-otp-signup:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Verify OTP for Signup
 *     description: Verifies the OTP sent to the user's email during signup and marks the user as verified.
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
 *                 description: The user's email address.
 *                 example: "user@example.com"
 *               otp:
 *                 type: number
 *                 description: The OTP sent to the user's email.
 *                 example: 123456
 *     responses:
 *       '200':
 *         description: OTP verified and user account activated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Confirmation message.
 *                   example: "User account verified successfully."
 *       '400':
 *         description: Bad request - missing required fields or invalid/expired OTP.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Error message detailing what went wrong.
 *                   example: "Please provide a valid email and OTP."
 *       '404':
 *         description: User not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Error message indicating the user was not found.
 *                   example: "User not found."
 *       '500':
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Error message indicating an internal server error.
 *                   example: "Internal server error."
 */

router.post('/verify-otp-signup', async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).send({ message: 'Please provide a valid email and OTP' });
    }

    try {
        // Find the user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).send({ message: 'User not found' });
        }

        // Check if the OTP matches and is not expired
        const otpNumber = parseInt(otp, 10);
        if (user.otp !== otpNumber) {
            return res.status(400).send({ message: 'Invalid OTP' });
        }

        if (new Date() > user.otpExpiresAt) {
            return res.status(400).send({ message: 'Expired OTP' });
        }

        // Update user's verified status and clear the OTP fields
        user.verified = true;
        user.otp = undefined;
        user.otpExpiresAt = undefined;
        await user.save();

        // Send email notification
        const emailContent = `
            <p>Hi ${user.username},</p>
            <p>Welcome to <strong>CraftedClimate</strong>! Your account has been successfully created.</p>
            <p>You can now monitor environmental data, manage your devices, and collaborate with others on our platform.</p>
            <p><a href="https://console.craftedclimate.co" target="_blank">Go to Dashboard</a></p>
            <p>Thank you for joining us in the fight against climate change.</p>
            <p> The CraftedClimate Team</p>
            `;

        await sendEmail(user.email, "You Crafted Climate Account has successfully been verified.", emailContent);

        res.status(200).send({ message: 'User account verified successfully' });
    } catch (error) {
        res.status(500).send({ message: 'Internal server error', error: error.message });
    }
});

/**
 * @swagger
 * /api/user/list-users:
 *   get:
 *     tags:
 *       - Users
 *     summary: Retrieve all users
 *     description: Fetches a list of all users, excluding their passwords. Requires admin privileges.
 *     responses:
 *       '200':
 *         description: A list of users retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                     description: The user's unique identifier.
 *                   username:
 *                     type: string
 *                     description: The user's username.
 *                   email:
 *                     type: string
 *                     description: The user's email address.
 *                   isAdmin:
 *                     type: boolean
 *                     description: Flag indicating whether the user has admin privileges.
 *                 example:
 *                   - _id: "507f1f77bcf86cd799439011"
 *                     username: "johndoe"
 *                     email: "johndoe@example.com"
 *                     isAdmin: false
 *                   - _id: "507f1f77bcf86cd799439012"
 *                     username: "janedoe"
 *                     email: "janedoe@example.com"
 *                     isAdmin: true
 *       '403':
 *         description: Access denied. User does not have admin privileges.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Error message indicating lack of access rights.
 *                   example: "Access denied."
 *       '500':
 *         description: Internal server error encountered while fetching users.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: General error message.
 *                   example: "Error fetching users."
 *                 error:
 *                   type: string
 *                   description: Detailed error message.
 *                   example: "Database connection failed."
 */

router.get('/list-users', authenticateToken, authorizeRoles('admin'), async (req, res) => {
    try {
        const users = await User.find().select('-password'); // Exclude passwords from the response
        res.status(200).send(users);
    } catch (error) {
        res.status(500).send({ message: 'Error fetching users', error: error.message });
        console.log(error);
    }
});


/**
 * @swagger
 * /api/user/user-info:
 *   get:
 *     tags:
 *       - Users
 *     summary: Retrieve user information
 *     description: Fetches user information based on the provided email or userID. If neither is provided, returns all users excluding their passwords.
 *     parameters:
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *         required: false
 *         description: The email address of the user to be fetched.
 *       - in: query
 *         name: userid
 *         schema:
 *           type: string
 *         required: false
 *         description: The unique identifier of the user to be fetched.
 *     responses:
 *       '200':
 *         description: User information retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                     description: The unique identifier of the user.
 *                   username:
 *                     type: string
 *                     description: The username of the user.
 *                   email:
 *                     type: string
 *                     description: The email address of the user.
 *                   isAdmin:
 *                     type: boolean
 *                     description: Indicates whether the user has administrative privileges.
 *       '404':
 *         description: User not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Error message indicating the user was not found.
 *                   example: "User not found"
 *       '500':
 *         description: Internal server error while fetching user information.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: General error message.
 *                   example: "Error fetching user(s)"
 *                 error:
 *                   type: string
 *                   description: Detailed error message.
 *                   example: "Database connection failed."
 */

router.get('/user-info', async (req, res) => {
    const { email, userid } = req.query; // Get email and userId from query parameters

    try {
        let query = {};
        if (email) {
            query.email = email; // Search by email if provided
        } else if (userid) {
            query.userid = userId; // Search by userId if provided
        }

        // If neither email nor userId is provided, this will fetch all users
        const users = await User.find(query).select('-password -otp');

        if (users.length === 0) {
            return res.status(404).send({ message: 'User not found' });
        }

        res.status(200).send(users);
    } catch (error) {
        res.status(500).send({ message: 'Error fetching user(s)', error: error.message });
        console.log(error);
    }
});


/**
 * @swagger
 * /api/user/update-user/{userid}:
 *   put:
 *     tags:
 *       - Users
 *     summary: Update a user's information
 *     description: Updates the specified user's details including profile picture.
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - name: userid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique identifier of the user to update.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 example: "new_username"
 *               email:
 *                 type: string
 *                 example: "newemail@example.com"
 *               contact:
 *                 type: string
 *                 example: "233541234567"
 *               firstName:
 *                 type: string
 *                 example: "Kwame"
 *               lastName:
 *                 type: string
 *                 example: "Nkrumah"
 *               profilePicture:
 *                 type: string
 *                 format: binary
 *                 description: New profile picture file (JPG, PNG, etc.)
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User updated successfully"
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */

router.put('/update-user/:userid', upload.single('profilePicture'), async (req, res) => {
    const { userid } = req.params;
    const updateData = req.body;

    try {
        // If new profile image is uploaded
        if (req.file) {
            const fileName = `profile-${Date.now()}-${req.file.originalname}`;
            const blockBlobClient = containerClient.getBlockBlobClient(fileName);

            await blockBlobClient.upload(req.file.buffer, req.file.buffer.length, {
                blobHTTPHeaders: { blobContentType: req.file.mimetype },
            });

            const profileUrl = generateSignedUrl(fileName);
            updateData.profilePicture = profileUrl;
        }

        const updatedUser = await User.findOneAndUpdate(
            { userid },
            updateData,
            { new: true }
        ).select('-password');

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
});



/**
 * @swagger
 * /api/user/delete-user/{userid}:
 *   delete:
 *     tags:
 *       - Users
 *     summary: Delete a user
 *     description: Deletes a specified user based on the provided user ID. Requires appropriate permissions to perform this operation.
 *     parameters:
 *       - name: userid
 *         in: path
 *         required: true
 *         description: The unique identifier of the user to be deleted.
 *         type: string
 *     responses:
 *       200:
 *         description: User deleted successfully.
 *         schema:
 *           type: object
 *           properties:
 *             message:
 *               type: string
 *               example: "User deleted successfully"
 *       404:
 *         description: User not found.
 *         schema:
 *           type: object
 *           properties:
 *             message:
 *               type: string
 *               example: "User not found"
 *       500:
 *         description: Internal server error while attempting to delete the user.
 *         schema:
 *           type: object
 *           properties:
 *             message:
 *               type: string
 *               example: "Internal server error"
 *             error:
 *               type: string
 *               description: Detailed error information.
 */

router.delete('/delete-user/:userid', authorizeRoles('admin'), async (req, res) => {
    const { userid } = req.params;

    try {
        // Optionally, check if the user has the right to delete this profile
        const deletedUser = await User.findOneAndDelete({ userid: userid });
        if (!deletedUser) {
            return res.status(404).send({ message: 'User not found' });
        }

        res.status(200).send({ message: 'User deleted successfully' });
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
 * /api/auth/verify-otp-reset-password:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Verify OTP and reset password
 *     description: Verifies the 6-digit OTP sent to the user's email and allows them to reset their password.
 *     consumes:
 *       - application/json
 *     requestBody:
 *       description: The data required to verify OTP and reset the password.
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
 *                 description: The user's email address.
 *                 example: "user@example.com"
 *               otp:
 *                 type: string
 *                 description: The 6-digit OTP sent to the user's email.
 *                 example: "123456"
 *               newPassword:
 *                 type: string
 *                 description: The new password the user wishes to set.
 *                 example: "newPassword123"
 *     responses:
 *       '200':
 *         description: Password reset successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Confirmation message.
 *                   example: "Password reset successfully"
 *       '400':
 *         description: Bad request - missing or invalid data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Error message indicating what went wrong.
 *                   example: "Please provide email, OTP, and new password"
 *       '404':
 *         description: User not found or OTP expired/invalid.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Error message indicating the user was not found or the OTP is invalid.
 *                   example: "Invalid or expired OTP"
 *       '500':
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: General error message.
 *                   example: "Internal server error"
 *                 error:
 *                   type: string
 *                   description: Detailed error information.
 */


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


router.post('/verify-otp-reset-password', async (req, res) => {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
        return res.status(400).send({ message: 'Please provide email, OTP, and new password' });
    }

    try {
        // Find the user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).send({ message: 'User not found' });
        }

        // Convert the OTP to a number
        const otpNumber = parseInt(otp, 10);

        // // Log the current state for debugging
        // console.log(`Stored OTP: ${user.otp}, Type: ${typeof user.otp}`);
        // console.log(`Received OTP: ${otpNumber}, Type: ${typeof otpNumber}`);
        // console.log(`Stored OTP Expiration: ${user.otpExpiresAt}, Current Time: ${new Date()}`);

        // Check if the OTP matches and is not expired
        if (user.otp !== otpNumber) {
            return res.status(400).send({ message: 'Invalid OTP' });
        }

        if (new Date() > user.otpExpiresAt) {
            return res.status(400).send({ message: 'Expired OTP' });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update user's password and clear the OTP fields
        user.password = hashedPassword;
        user.otp = undefined; // Clear the OTP
        user.otpExpiresAt = undefined; // Clear the OTP expiration time
        await user.save();

        // Send email notification
        const emailContent = `
            <p>Hi ${user.username},</p>
            <p>Your password has been successfully reset for your <strong>CraftedClimate</strong> account.</p>
            <p>If you did not request this change, please <a href="https://console.craftedclimate.co/support" target="_blank">contact support</a> immediately.</p>
            <p><a href="https://console.craftedclimate.co" target="_blank">Go to Dashboard</a></p>
            <p>Stay secure, and thank you for being part of our climate impact mission.</p>
            <p>— The CraftedClimate Team</p>
            `;

        await sendEmail(user.email, "Your CraftedClimate Password Was Reset", emailContent);
        res.status(200).send({ message: 'Password reset successfully' });
    } catch (error) {
        res.status(500).send({ message: 'Internal server error', error: error.message });
    }
});

/**
 * @swagger
 * /api/auth/change-role/{userid}:
 *   patch:
 *     tags:
 *       - Authentication
 *     summary: Change a user's role
 *     description: Change the role of a specific user. Requires an API key in the `X-API-KEY` header.
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         description: The unique user ID to change the role for.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [admin, supervisor, user]
 *                 example: supervisor
 *     responses:
 *       200:
 *         description: Role updated successfully
 *       400:
 *         description: Missing or invalid data
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */

router.patch('/change-role/:userid', verifyApiKey, authenticateToken, authorizeRoles('admin'), async (req, res) => {
    const { userid } = req.params;
    const { role } = req.body;

    if (!role || !['admin', 'supervisor', 'user'].includes(role)) {
        return res.status(400).send({ message: 'Invalid or missing role' });
    }

    try {
        const user = await User.findOneAndUpdate(
            { userid },
            { role },
            { new: true }
        ).select('-password');

        if (!user) {
            return res.status(404).send({ message: 'User not found' });
        }

        res.status(200).send({ message: 'User role updated successfully', user });
    } catch (error) {
        res.status(500).send({ message: 'Internal server error', error: error.message });
    }
});


module.exports = router;
