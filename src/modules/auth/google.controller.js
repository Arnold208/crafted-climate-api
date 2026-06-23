const jwt = require('jsonwebtoken');

/**
 * Handle Google OAuth Callback
 * Generates JWT tokens and returns them
 */
exports.googleCallback = async (req, res) => {
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
            expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m',
        });
        const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d'
        });

        // Save refresh token to user document
        user.refreshTokens = user.refreshTokens || [];
        user.refreshTokens.push(refreshToken);
        if (user.refreshTokens.length > 10) {
            user.refreshTokens.shift();
        }
        user.markModified('refreshTokens');
        user.refreshToken = refreshToken;
        await user.save();

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
            profilePicture: user.profilePicture,
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
        let decodedState = {};
        if (state) {
            try {
                decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
            } catch (e) {
                // Support legacy state format
                decodedState = { platform: state };
            }
        }

        if (decodedState.platform === 'api' || decodedState.platform === 'swagger') {
            console.log(`🔌 API/Swagger OAuth Success: Returning JSON payload`);
            return res.status(200).json(responseData);
        }

        if (decodedState.platform === 'mobile') {
            const encodedData = encodeURIComponent(JSON.stringify(responseData));
            const deepLink = `crowdsense://auth-callback?data=${encodedData}`;
            console.log(`📱 Mobile OAuth Success: Redirecting to deep link`);
            return res.redirect(302, deepLink);
        }

        // Web Redirect Flow
        const defaultAppUrl = process.env.APP_URL || 'https://console.craftedclimate.co';
        const targetUrlStr = decodedState.redirectUri || defaultAppUrl;

        try {
            const redirectUrl = new URL(targetUrlStr);
            redirectUrl.searchParams.set('accessToken', accessToken);
            redirectUrl.searchParams.set('refreshToken', refreshToken);
            redirectUrl.searchParams.set('userid', responseUser.userid);
            redirectUrl.searchParams.set('username', responseUser.username);
            redirectUrl.searchParams.set('email', responseUser.email);

            console.log(`🌐 Web OAuth Success: Redirecting to client: ${redirectUrl.origin}`);
            return res.redirect(302, redirectUrl.toString());
        } catch (err) {
            console.error('[GoogleAuth] Invalid target redirect URL, falling back to JSON response');
            return res.status(200).json(responseData);
        }

    } catch (error) {
        console.error('[GoogleAuth] Callback Controller Error:', error);
        res.status(500).json({ message: 'Internal server error during authentication' });
    }
};
