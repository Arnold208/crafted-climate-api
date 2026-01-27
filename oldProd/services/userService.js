const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const User = require('../model/user/userModel');
const Organization = require('../model/organization/organizationModel');
const Invitation = require('../model/invitation/invitationModel');
const Plan = require('../model/subscriptions/Plan');
const UserSubscription = require('../model/subscriptions/UserSubscription');

const { sendSMS } = require('../config/sms/sms');
const { containerClient, generateSignedUrl } = require('../config/storage/storage');
const { generateUserId } = require('../utils/idGenerator');

function normalizeContact(contact) {
    if (!contact) return contact;
    contact = contact.trim();
    if (contact.startsWith('0')) {
        return '233' + contact.slice(1);
    }
    return contact.replace(/^\+/, '');
}

/**
 * Service to handle User Authentication & Management
 */
class UserService {

    /**
     * Register a new user
     */
    async signup({ username, email, password, invitationId, contact, firstName, lastName, file }) {
        try {
            email = email.trim().replace(/\s+/g, '');
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

                role = "supervisor";
                if (invitation.deviceId) {
                    devices.push({ deviceId: invitation.deviceId, accessType: "invited" });
                }
            }

            // 2. CREATE USER RECORD
            const userid = generateUserId();
            const hashedPassword = await bcrypt.hash(password, 10);
            const otpCode = Math.floor(100000 + Math.random() * 900000);

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
                profilePicture: profilePictureUrl,
                role,
                devices,
                otp: otpCode,
                otpExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
                lastOtpSentAt: new Date(),
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

            // 6. SEND OTP
            await sendSMS(contact, `Your CraftedClimate OTP is ${otpCode}. It expires in 15 minutes.`);

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

        const user = await User.findOne({ email });
        if (!user) {
            throw new Error('User not found');
        }

        if (!user.verified) {
            throw new Error('Account not verified');
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            throw new Error('Invalid Password');
        }

        const payload = {
            userid: user.userid,
            email: user.email,
            username: user.username,
            platformRole: user.role,
            organizations: user.organization,
            currentOrganizationId: user.currentOrganizationId || null
        };

        const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
            expiresIn: '60m',
        });
        const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET);

        return {
            accessToken,
            refreshToken,
            user: {
                userid: user.userid,
                email: user.email,
                username: user.username,
                platformRole: user.role,
                organizations: user.organization,
                currentOrganizationId: user.currentOrganizationId || null,
                personalOrganizationId: user.personalOrganizationId || null,
                subscriptionId: user.subscription // This is a string UUID in your model
            }
        };
    }
}

module.exports = new UserService();
