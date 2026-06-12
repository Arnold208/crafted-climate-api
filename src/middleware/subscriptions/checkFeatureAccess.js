const getUserPlan = require('./getUserPlan');

/**
 * Checks if user has access to a specific feature
 * 
 * @param {string} featureName - Example: "device_update", "collaboration"
 */
function checkFeatureAccess(featureName) {
    return async (req, res, next) => {
        try {
            const userid = req.user?.userid || req.body.userid || req.params.userid;
            const orgId = req.headers['x-org-id'] || req.user?.currentOrganizationId;

            if (!userid) {
                return res.status(401).json({ message: "User ID missing in request." });
            }

            // Get the user's subscription hierarchy (org prioritized, falling back to personal)
            const { plan } = await getUserPlan(userid, orgId);

            const featureAllowed = plan.features?.[featureName];

            if (!featureAllowed) {
                return res.status(403).json({
                    message: `Your current plan (${plan.name}) does not allow the feature: ${featureName}`
                });
            }

            // Allow route to continue
            next();

        } catch (err) {
            console.error(`Feature check error for ${featureName}:`, err);
            if (err.message.includes("subscription") || err.message.includes("plan")) {
                return res.status(403).json({ message: err.message });
            }
            res.status(500).json({ error: "Server error checking feature permissions." });
        }
    };
}

module.exports = checkFeatureAccess;
