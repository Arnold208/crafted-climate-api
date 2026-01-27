const UserSubscription = require('../../models/subscriptions/UserSubscription');
const Plan = require('../../models/subscriptions/Plan');

/**
 * Checks if user has access to a specific feature
 * 
 * @param {string} featureName - Example: "device_update", "collaboration"
 */
function checkFeatureAccess(featureName) {
    return async (req, res, next) => {
        try {
            const userid = req.user?.userid || req.body.userid || req.params.userid;

            if (!userid) {
                return res.status(401).json({ message: "User ID missing in request." });
            }

            // Get the user's subscription
            const subscription = await UserSubscription.findOne({ userid: userid });
            if (!subscription) {
                return res.status(403).json({ message: "No active subscription found." });
            }

            const plan = await Plan.findOne({ planId: subscription.planId });
            if (!plan) {
                return res.status(403).json({ message: "Subscription plan not found." });
            }

            const featureAllowed = plan.features?.[featureName];

            if (!featureAllowed) {
                return res.status(403).json({
                    message: `Your current plan does not allow the feature: ${featureName}`
                });
            }

            // Allow route to continue
            next();

        } catch (err) {
            console.error(`Feature check error for ${featureName}:`, err);
            res.status(500).json({ error: "Server error checking feature permissions." });
        }
    };
}

module.exports = checkFeatureAccess;
