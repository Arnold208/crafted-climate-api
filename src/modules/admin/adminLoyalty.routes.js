const express = require('express');
const router = express.Router();
const adminLoyaltyController = require('./adminLoyalty.controller');
const authenticateToken = require('../../middleware/bearermiddleware');
const authorizeRoles    = require('../../middleware/rbacMiddleware');

// All routes: require valid JWT + admin platform role
const guard = [authenticateToken, authorizeRoles('admin')];

/**
 * @swagger
 * tags:
 *   - name: Admin Loyalty
 *     description: Manage the CrowdSense loyalty points system (level thresholds & action values)
 */

/**
 * @swagger
 * /api/admin/loyalty/config:
 *   get:
 *     tags: [Admin Loyalty]
 *     summary: Get current loyalty configuration
 *     description: Returns the live level thresholds, action point values, and audit metadata.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuration retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     levelThresholds:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           level:     { type: string, example: "Learner" }
 *                           minPoints: { type: integer, example: 50 }
 *                     actionValues:
 *                       type: object
 *                       example: { "lesson_completed": 10, "quiz_completed": 15 }
 *                     lastUpdatedBy: { type: string, nullable: true }
 *                     lastUpdatedAt: { type: string, format: date-time, nullable: true }
 *       403:
 *         description: Forbidden — admin role required
 */
router.get('/config', guard, adminLoyaltyController.getConfig);

/**
 * @swagger
 * /api/admin/loyalty/config/thresholds:
 *   put:
 *     tags: [Admin Loyalty]
 *     summary: Update level thresholds
 *     description: |
 *       Replaces the level threshold table. At least one entry must have minPoints: 0
 *       (the entry level). Changes take effect immediately — the in-memory cache is
 *       invalidated on update.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [thresholds]
 *             properties:
 *               thresholds:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [level, minPoints]
 *                   properties:
 *                     level:     { type: string, example: "Learner" }
 *                     minPoints: { type: integer, example: 75 }
 *             example:
 *               thresholds:
 *                 - { level: "Explorer",  minPoints: 0    }
 *                 - { level: "Learner",   minPoints: 75   }
 *                 - { level: "Advocate",  minPoints: 200  }
 *                 - { level: "Champion",  minPoints: 450  }
 *                 - { level: "Pioneer",   minPoints: 900  }
 *                 - { level: "Legend",    minPoints: 1500 }
 *     responses:
 *       200:
 *         description: Thresholds updated
 *       400:
 *         description: Validation error
 *       403:
 *         description: Forbidden
 */
router.put('/config/thresholds', guard, adminLoyaltyController.updateThresholds);

/**
 * @swagger
 * /api/admin/loyalty/config/action-values:
 *   put:
 *     tags: [Admin Loyalty]
 *     summary: Update per-action point values
 *     description: |
 *       Replaces the action → points mapping. The server uses these values authoritatively —
 *       clients cannot override them. Adding a new key here enables a new action type.
 *       Removing a key disables that action. Changes take effect immediately.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [actionValues]
 *             properties:
 *               actionValues:
 *                 type: object
 *                 additionalProperties:
 *                   type: integer
 *                   minimum: 0
 *             example:
 *               actionValues:
 *                 lesson_completed:    10
 *                 quiz_completed:      20
 *                 challenge_completed: 30
 *                 community_report:    8
 *                 device_connected:    15
 *                 daily_login:         3
 *     responses:
 *       200:
 *         description: Action values updated
 *       400:
 *         description: Validation error
 *       403:
 *         description: Forbidden
 */
router.put('/config/action-values', guard, adminLoyaltyController.updateActionValues);

/**
 * @swagger
 * /api/admin/loyalty/config/reset:
 *   post:
 *     tags: [Admin Loyalty]
 *     summary: Reset loyalty config to factory defaults
 *     description: |
 *       Resets both level thresholds and action values to the original product defaults.
 *       Use this to undo experimental changes. Cache is invalidated immediately.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Config reset to defaults
 *       403:
 *         description: Forbidden
 */
router.post('/config/reset', guard, adminLoyaltyController.resetToDefaults);

module.exports = router;
