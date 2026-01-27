const { PLAN_FEATURES } = require('../../config/planFeatures');
const getUserPlan = require('./getUserPlan'); // Re-use existing helper to fetch plan

/**
 * Middleware to check if a specific feature is enabled for the user's plan.
 * Usage: router.get('/endpoint', checkPlanFeature('analytics'), controller)
 * 
 * @param {string} featureName - Key from PLAN_FEATURES (e.g., 'analytics', 'collaboration', 'apiAccess')
 * @param {any} requiredValue - Optional. If set, checks if feature value === requiredValue. 
 *                              If not set, checks if feature is truthy.
 */
const checkPlanFeature = (featureName, requiredValue = null) => {
    return async (req, res, next) => {
        try {
            // 1. Ensure User Plan is Loaded (Dependency)
            // If verifyOrgMembership or explicit getUserPlan wasn't run, run it now.
            // However, getUserPlan middleware attaches to req.userSubscription & req.userPlan
            // We will assume this middleware is chained AFTER auth and optionally after org context.

            const userid = req.user.userid;
            const orgId = req.headers['x-org-id'] || req.user.currentOrganizationId;

            // Use the shared helper to resolve the effective plan (org vs personal)
            const { plan } = await getUserPlan(userid, orgId);

            if (!plan) {
                return res.status(403).json({ message: "No active subscription found." });
            }

            // 2. Resolve Effective Feature Config
            // The plan object from DB might have features in `plan.features` OR we map from config.
            // Since we recently updated `planFeatures.js`, but DB plans might be stale, 
            // we should preferentially check the Plan model's stored features if they exist, 
            // OR map the plan name to our config file for runtime overrides.

            // Strategy: Use Config file based on Plan Name for "System Features" to ensure 
            // immediate updates without DB migration.
            let effectiveFeatures = PLAN_FEATURES[plan.name.toLowerCase()];

            // Fallback: If plan name is custom (not in config), use stored DB features
            if (!effectiveFeatures) {
                // Map DB schema to config shape if needed, or just use what's there
                effectiveFeatures = plan.features || {};
                // Note: DB schema might not have 'maxMembers' or 'aiInsightsLevel' if not migrated.
                // This is a tradeoff. For now, standard plans (free, pro, enterprise) rule.
            }

            // 3. Check Feature
            const featureValue = effectiveFeatures[featureName];

            if (requiredValue !== null) {
                // Strict equality check (e.g. apiAccess === 'full')
                if (featureValue !== requiredValue) {
                    return res.status(403).json({
                        message: `Upgrade Required: This feature requires '${featureName}' to be '${requiredValue}'.`,
                        currentPlan: plan.name
                    });
                }
            } else {
                // Truthy check (boolean or existing value)
                if (!featureValue) {
                    return res.status(403).json({
                        message: `Upgrade Required: Your plan (${plan.name}) does not support '${featureName}'.`,
                        upgradeUrl: "/upgrade"
                    });
                }
            }

            // Attach feature context for downstream usage (e.g. limit counts)
            req.planFeatures = effectiveFeatures;
            next();

        } catch (error) {
            console.error("Plan Feature Check Error:", error);
            res.status(500).json({ message: "Internal Subscription Error" });
        }
    };
};

module.exports = checkPlanFeature;
