const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/user/userModel');
const userService = require('../modules/user/user.service');
const { v4: uuidv4 } = require('uuid');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
    scope: ['profile', 'email']
},
    async function (accessToken, refreshToken, profile, cb) {
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

            // We use the userService to ensure all initialization (Org creation, Plan assignment) happens.
            await userService.signup({
                username,
                email,
                password,
                firstName,
                lastName,
                invitationId: null,
                contact: null
            });

            // Fetch back the user to add googleId (since signup doesn't accept googleId arg currently)
            user = await User.findOne({ email });
            if (user) {
                user.googleId = googleId;
                user.verified = true; // Google trust implies verified email usually
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
