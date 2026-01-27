const express = require('express');
const router = express.Router();
const adminController = require('./admin.controller');

const authenticateToken = require('../../middleware/bearermiddleware');
const requirePlatformAdmin = require('../../middleware/requirePlatformAdmin');

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     tags: [Platform Admin - Dashboard]
 *     summary: Get high-level system dashboard metrics
 *     description: Returns aggregated metrics for users, orgs, devices, and financial estimates (Platform Admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard metrics retrieved successfully
 *       403:
 *         description: Forbidden - Platform Admin only
 */
router.get('/dashboard', authenticateToken, requirePlatformAdmin, adminController.getDashboard);

module.exports = router;
