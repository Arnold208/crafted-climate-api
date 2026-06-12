const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/user/userModel');
const userService = require('../modules/user/user.service');
const Invitation = require('../models/invitation/invitationModel');
const { v4: uuidv4 } = require('uuid');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
    scope: ['profile', 'email'],
    passReqToCallback: true
},
    async function (req, accessToken, refreshToken, profile, cb) {
        try {
            const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
            const googleId = profile.id;

            if (!email) {
                return cb(new Error("No email found in Google Profile"), null);
            }

            // 1. Try to find user by googleId
            let user = await User.findOne({ googleId });

            if (user) {
                console.log(`[GoogleAuth] User found by GoogleID: ${email}`);
                return cb(null, user);
            }

            // 2. Try to find user by email (Account Linking)
            user = await User.findOne({ email });

            if (user) {
                console.log(`[GoogleAuth] User found by Email (Linking Account): ${email}`);
                user.googleId = googleId;
                user.verified = true; // Mark as verified when linking
                await user.save();
                return cb(null, user);
            }

            // 3. User doesn't exist - Create new user
            console.log(`[GoogleAuth] Creating new user for: ${email}`);

            const password = uuidv4(); // Generate random secure password
            // Ensure username is unique enough or let service handle duplicates if logic exists
            // simplified username generation:
            const username = email.split('@')[0] + '_' + uuidv4().substring(0, 4);
            const firstName = profile.name ? profile.name.givenName : 'User';
            const lastName = profile.name ? profile.name.familyName : '';

            // Parse invitation ID from state if present
            let invitationId = null;
            if (req && req.query && req.query.state) {
                try {
                    const stateObj = JSON.parse(Buffer.from(req.query.state, 'base64').toString('utf8'));
                    if (stateObj && stateObj.invitationId) {
                        invitationId = stateObj.invitationId;
                        console.log(`[GoogleAuth] Invitation ID found in state: ${invitationId}`);
                    }
                } catch (e) {
                    console.log(`[GoogleAuth] Non-JSON state received: ${req.query.state}`);
                }
            }

            // We use the userService to ensure all initialization (Org creation, Plan assignment) happens.
            await userService.signup({
                username,
                email,
                password,
                firstName,
                lastName,
                invitationId,
                contact: null,
                isVerified: true
            });

            // Fetch back the user
            user = await User.findOne({ email });
            if (user) {
                user.googleId = googleId;
                await user.save();
            }

            return cb(null, user);

        } catch (err) {
            console.error('[GoogleAuth] Strategy Error:', err);
            return cb(err, null);
        }
    }
));

module.exports = passport;
