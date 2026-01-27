const express = require('express');
const router = express.Router();
const logsController = require('./logs.controller');
const rateLimit = require('express-rate-limit');

const authenticateToken = require('../../middleware/bearermiddleware');
const checkOrgAccess = require('../../middleware/organization/checkOrgAccess');

const logQueryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many log queries, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * @swagger
 * tags:
 *   name: Audit Logs
 *   description: Access audit logs for organizations and platform
 */

router.get('/org/:orgId/logs',
    authenticateToken,
    logQueryLimiter,
    checkOrgAccess('org.logs.view'),
    logsController.getOrgLogs
);

router.get('/platform/logs',
    authenticateToken,
    logQueryLimiter,
    logsController.getPlatformLogs
);

module.exports = router;
