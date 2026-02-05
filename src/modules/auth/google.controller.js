const jwt = require('jsonwebtoken');

/**
 * Handle Google OAuth Callback
 * Generates JWT tokens and returns them
 */
exports.googleCallback = (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            // This normally shouldn't be reached if passport failureRedirect handles it,
            // but good for safety.
            return res.status(401).json({ message: 'Authentication failed' });
        }

        // Generate Payload - Matching user.service.js login payload
        const payload = {
            userid: user.userid,
            email: user.email,
            username: user.username,
            platformRole: user.role, // Note: user.role might be deprecated vs platformRole, using both for safety if needed
            organizations: user.organization || [], // Assuming this is populated or array of IDs
            currentOrganizationId: user.currentOrganizationId || null
        };

        const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN,
        });
        const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN
        });

        // Determine subscription tier (Simplified logic or mirroring login)
        // Ideally we'd fetch this, but for now we'll match the login response structure.
        const responseUser = {
            userid: user.userid,
            email: user.email,
            username: user.username,
            platformRole: user.role || user.platformRole,
            organizations: user.organization,
            currentOrganizationId: user.currentOrganizationId,
            personalOrganizationId: user.personalOrganizationId,
            subscriptionId: user.subscription,
            // subscriptionTier: "..." // omitted to avoid extra DB query here, frontend usually fetches profile
        };

        // SUCCESS RESPONSE
        const responseData = {
            message: 'Google Authentication Successful',
            accessToken,
            refreshToken,
            user: responseUser
        };

        // Check if this was a mobile request via state parameter
        const state = req.query.state;
        if (state === 'mobile') {
            const encodedData = encodeURIComponent(JSON.stringify(responseData));
            const deepLink = `crowdsense://auth-callback?data=${encodedData}`;
            console.log(`📱 Mobile OAuth Success: Redirecting to deep link`);
            return res.redirect(302, deepLink);
        }

        // For API usage (Postman/Web), JSON is correct.
        res.status(200).json(responseData);

    } catch (error) {
        console.error('[GoogleAuth] Callback Controller Error:', error);
        res.status(500).json({ message: 'Internal server error during authentication' });
    }
};
