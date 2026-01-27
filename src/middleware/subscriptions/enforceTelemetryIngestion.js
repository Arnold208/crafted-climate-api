// middleware/subscriptions/enforceTelemetryIngestion.js

const registerNewDevice = require('../../models/devices/registerDevice');
const UserSubscription = require('../../models/subscriptions/UserSubscription');
const Plan = require('../../models/subscriptions/Plan');

module.exports = async function enforceTelemetryIngestion(req, res, next) {
    try {
        const devid = req.body.i;

        if (!devid) {
            return res.status(400).json({ message: "Missing device ID (i)" });
        }

        const device = await registerNewDevice.findOne({ devid });
        if (!device) {
            return res.status(404).json({ message: "Device not registered" });
        }

        const sub = await UserSubscription.findOne({ userid: device.userid });
        if (!sub || sub.status !== "active") {
            return res.status(403).json({ message: "Device owner's subscription is inactive" });
        }

        const plan = await Plan.findOne({ planId: sub.planId });
        if (!plan) {
            return res.status(500).json({ message: "Subscription plan invalid or corrupted" });
        }

        // Optional: Later you can enforce ingestionQuota per hour

        return next();

    } catch (err) {
        console.error("Telemetry ingestion middleware error:", err);
        return res.status(500).json({
            message: "Internal server error (ingestion middleware)",
            error: err.message
        });
    }
};
