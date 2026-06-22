'use strict';
const express    = require('express');
const router     = express.Router();
const controller = require('./eventLog.controller');
const authenticateToken = require('../../../middleware/bearermiddleware');
const { requirePermission } = require('../../../middleware/authenticateApiKey');

/**
 * Device Event Log Routes
 *
 * GET /api/devices/:auid/logs          — device-specific log (owner/collaborator)
 * GET /api/devices/:auid/logs/latest   — latest N events (quick widget)
 * GET /api/devices/logs/my             — all logs for authenticated user's devices
 *
 * Org logs are mounted separately on the organization router:
 * GET /api/organizations/:orgId/device-logs
 */

// ── Device-scoped ─────────────────────────────────────────────────────────────
router.get(
    '/:auid/logs/latest',
    authenticateToken,
    requirePermission('devices:read'),
    controller.getLatest.bind(controller)
);

router.get(
    '/:auid/logs',
    authenticateToken,
    requirePermission('devices:read'),
    controller.getDeviceLogs.bind(controller)
);

// ── User-scoped ───────────────────────────────────────────────────────────────
router.get(
    '/logs/my',
    authenticateToken,
    requirePermission('devices:read'),
    controller.getMyLogs.bind(controller)
);

module.exports = router;
