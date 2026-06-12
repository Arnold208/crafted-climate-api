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

        // 🔒 SECURITY: Verify the x-device-secret header against the device's manufacturingId
        const deviceSecret = req.headers['x-device-secret'];
        if (!deviceSecret || deviceSecret !== device.manufacturingId) {
            return res.status(401).json({ message: "Unauthorized device secret" });
        }

        const getUserPlan = require('./getUserPlan');
        let sub, plan;
        try {
            const result = await getUserPlan(device.userid, device.organizationId);
            sub = result.sub;
            plan = result.plan;
        } catch (err) {
            return res.status(403).json({ message: err.message });
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
