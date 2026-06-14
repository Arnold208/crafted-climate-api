const express = require('express');
const router = express.Router();
const { client: redis } = require('../../config/redis/redis');
const { checkOfflineDevices } = require('../../cron/offlineAlertCron');

/**
 * @swagger
 * /api/test:
 *   get:
 *     summary: Simple test endpoint
 *     responses:
 *       200:
 *         description: Returns a success message
 */
router.get('/test', (req, res) => {
    res.json({ message: 'Hello from test route' });
});

/**
 * POST /api/test/simulate-heartbeat
 * Simulates a device going online or offline in Redis
 */
router.post('/test/simulate-heartbeat', async (req, res) => {
    try {
        const { auid, status } = req.body;
        if (!auid || !status) {
            return res.status(400).json({ error: 'auid and status required' });
        }

        let score = Date.now();
        if (status === 'offline') {
            // Set heartbeat score to 24 hours ago
            score = Date.now() - 24 * 60 * 60 * 1000;
            
            // Clear the suppressor context key so alerts trigger instantly
            const contextKey = `device:${auid}:alert:context`;
            await redis.del(contextKey);
        }

        await redis.zAdd('devices:heartbeat', [{ score, value: auid }]);

        if (status === 'offline') {
            // Trigger offline check process immediately
            await checkOfflineDevices();
        }

        res.json({ success: true, message: `Device ${auid} simulated as ${status}` });
    } catch (err) {
        console.error('[Simulate Heartbeat Error]:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/test/promote-user
 * Promotes a user to Platform Admin for testing purposes
 */
router.post('/test/promote-user', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'email is required' });
        }
        
        // Import User model dynamically to prevent circular dependencies
        const User = require('../../models/user/userModel');
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        user.platformRole = 'admin';
        user.role = 'admin';
        await user.save();
        
        res.json({ success: true, message: `User ${email} successfully promoted to Platform Admin` });
    } catch (err) {
        console.error('[Promote User Error]:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
