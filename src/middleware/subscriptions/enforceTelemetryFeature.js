// middleware/subscriptions/enforceTelemetryFeature.js

const UserSubscription = require('../../models/subscriptions/UserSubscription');
const Plan = require('../../models/subscriptions/Plan');
const UsageLog = require('../../models/subscriptions/UsageLog');
const registerNewDevice = require('../../models/devices/registerDevice');

module.exports = function enforceTelemetryFeature({ feature, quotaKey, log }) {
    return async (req, res, next) => {
        try {
            let userid = null;

            /**
             * 1️⃣ PRIMARY SOURCE — JWT TOKEN
             * This MUST be used first to avoid inconsistent IDs.
             */
            if (req.user && req.user.userid) {
                userid = req.user.userid;
            }

            /**
             * 2️⃣ SECONDARY SOURCE — device owner (AU-ID based)
             * Used only when route is device-specific.
             */
            if (!userid && req.params.auid) {
                const dev = await registerNewDevice.findOne({ auid: req.params.auid }).lean();
                if (dev) {
                    userid = dev.userid;
                }
            }

            /**
             * 3️⃣ If still missing → reject request
             */
            if (!userid) {
                return res.status(401).json({
                    message: "Unauthorized: User ID could not be resolved (JWT/AUID missing)"
                });
            }

            /**
             * 4️⃣ Fetch subscription (using new field name `userid`)
             */
            const sub = await UserSubscription.findOne({ userid });
            if (!sub || sub.status !== "active") {
                return res.status(403).json({
                    message: "No active subscription for this user"
                });
            }

            /**
             * 5️⃣ Fetch plan
             */
            const plan = await Plan.findOne({ planId: sub.planId });
            if (!plan) {
                return res.status(500).json({
                    message: "Invalid subscription plan"
                });
            }

            /**
             * 6️⃣ FEATURE CHECK
             */
            if (feature && !plan.features?.[feature]) {
                return res.status(403).json({
                    message: `Your plan does not allow this action: ${feature}`
                });
            }

            /**
             * 7️⃣ QUOTA CHECK
             */
            if (quotaKey && plan.quotas?.[quotaKey] !== undefined) {
                const allowed = plan.quotas[quotaKey];

                const used = await UsageLog.countDocuments({
                    userid,
                    type: quotaKey,
                    createdAt: {
                        $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                    }
                });

                if (used >= allowed) {
                    return res.status(403).json({
                        message: `Monthly quota exceeded for: ${quotaKey}`,
                        used,
                        allowed
                    });
                }
            }

            /**
             * 8️⃣ LOG THE USAGE EVENT
             */
            if (log) {
                await UsageLog.create({
                    userid,
                    type: log
                });
            }

            return next();

        } catch (err) {
            console.error("Feature middleware error:", err);
            return res.status(500).json({
                message: "Internal server error (feature middleware)",
                error: err.message
            });
        }
    };
};
