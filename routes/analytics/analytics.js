const express = require('express');
const router = express.Router();
const User = require('../../model/user/userModel');
const registerNewDevice = require('../../model/devices/registerDevice');
const authenticateToken = require('../../middleware/bearermiddleware');
const authorizeRoles = require('../../middleware/rbacMiddleware');
const { client: redis } = require('../../config/redis/redis');

/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: User and Device Analytics endpoints
 */

/**
 * @swagger
 * /api/analytics/dashboard:
 *   get:
 *     tags:
 *       - Analytics
 *     summary: User Dashboard Analytics
 *     description: Returns aggregated stats for the logged-in user (total devices, active/offline count, subscription info).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard stats retrieved successfully.
 *       500:
 *         description: Server error.
 */
router.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        const userid = req.user.userid;

        // 1. Get User's Devices
        const devices = await registerNewDevice.find({ userid });
        const totalDevices = devices.length;

        // 2. Count Online/Offline (from MongoDB status, which is synced from Redis via cron)
        // Note: For real-time accuracy, we could query Redis, but Mongo is usually "good enough" if cron runs often.
        // Let's rely on the metadata stored in Mongo for speed.
        const onlineCount = devices.filter(d => d.status === 'online').length;
        const offlineCount = devices.filter(d => d.status === 'offline').length;

        // 3. User Subscription Info
        const user = await User.findOne({ userid }).populate('subscription');
        const subscriptionName = user.subscription ? user.subscription.planId : 'Free'; // Fallback if population fails or is UUID

        res.status(200).json({
            stats: {
                totalDevices,
                online: onlineCount,
                offline: offlineCount,
                subscription: subscriptionName
            }
        });

    } catch (error) {
        console.error("Dashboard Analytics Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /api/analytics/device/{auid}/summary:
 *   get:
 *     tags:
 *       - Analytics
 *     summary: Device Performance Summary
 *     description: Returns summary stats for a specific device (uptime, last seen, battery).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Device summary retrieved.
 *       404:
 *         description: Device not found.
 */
router.get('/device/:auid/summary', authenticateToken, async (req, res) => {
    try {
        const { auid } = req.params;
        const userid = req.user.userid;

        // Ensure user owns this device (or is admin)
        const device = await registerNewDevice.findOne({ auid });
        if (!device) return res.status(404).json({ message: 'Device not found' });

        if (req.user.role !== 'admin' && device.userid !== userid) {
            // Check collaboration permissions if needed, for now restrict to owner/admin
            return res.status(403).json({ message: 'Access denied' });
        }

        // Fetch latest state from Redis for real-time accuracy
        const metadataStr = await redis.hGet(auid, 'metadata');
        const metadata = metadataStr ? JSON.parse(metadataStr) : {};

        res.status(200).json({
            auid: device.auid,
            nickname: device.nickname,
            status: metadata.status || device.status || 'unknown',
            battery: metadata.battery || device.battery || 0,
            lastSeen: device.updatedAt, // Or parse from Redis timestamp if available
            location: device.location
        });

    } catch (error) {
        console.error("Device Summary Analytics Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /api/analytics/admin/system-stats:
 *   get:
 *     tags:
 *       - Analytics
 *     summary: System-wide Admin Stats
 *     description: Returns total users and devices in the system.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System stats retrieved.
 *       403:
 *         description: Admin access required.
 */
router.get('/admin/system-stats', authenticateToken, authorizeRoles('admin'), async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalDevices = await registerNewDevice.countDocuments();
        const activeDevices = await registerNewDevice.countDocuments({ status: 'online' });

        res.status(200).json({
            users: totalUsers,
            devices: {
                total: totalDevices,
                active: activeDevices,
                offline: totalDevices - activeDevices
            }
        });

    } catch (error) {
        console.error("Admin Analytics Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

module.exports = router;
