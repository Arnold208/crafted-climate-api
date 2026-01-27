const express = require('express');
const router = express.Router();
const telemetryController = require('./telemetry.controller');

// Middleware
const { dbRouteLimiter, csvRouteLimiter } = require('../../middleware/rateLimiter');
const enforceTelemetryIngestion = require('../../middleware/subscriptions/enforceTelemetryIngestion');
const enforceTelemetryFeature = require('../../middleware/subscriptions/enforceTelemetryFeature');
const authenticateToken = require('../../middleware/bearermiddleware');
const checkOrgAccess = require("../../middleware/organization/checkOrgAccess");
const checkTelemetryReadAccess = require("../../middleware/organization/checkTelemetryReadAccess");

const checkPlanFeature = require('../../middleware/subscriptions/checkPlanFeature');

// Routes

/**
 * @swagger
 * /api/telemetry/{model}:
 *   post:
 *     tags: [Telemetry]
 *     summary: Ingest telemetry data
 *     description: Submit sensor data for a specific device model.
 *     parameters:
 *       - in: path
 *         name: model
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201: { description: Data ingested successfully }
 */
router.post('/:model', enforceTelemetryIngestion, telemetryController.ingest);

/**
 * @swagger
 * /api/telemetry/{userid}/device/{auid}:
 *   get:
 *     tags: [Telemetry]
 *     summary: Get device telemetry summary
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 */
router.get('/:userid/device/:auid', telemetryController.getDeviceTelemetry);

/**
 * @swagger
 * /api/telemetry/public/telemetry:
 *   get:
 *     tags: [Telemetry]
 *     summary: Get public telemetry data
 */
router.get('/public/telemetry', telemetryController.getPublicTelemetry);

/**
 * @swagger
 * /api/telemetry/db/{model}/{auid}:
 *   get:
 *     tags: [Telemetry]
 *     summary: Get historical telemetry from database
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: model
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 */
router.get('/db/:model/:auid',
    authenticateToken,
    checkOrgAccess("org.devices.view"),
    checkTelemetryReadAccess,
    checkPlanFeature('device_read'),
    dbRouteLimiter,
    telemetryController.getDbTelemetry
);

/**
 * @swagger
 * /api/telemetry/db/{model}/{auid}/csv:
 *   get:
 *     tags: [Telemetry]
 *     summary: Export telemetry as CSV
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: model
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 */
router.get('/db/:model/:auid/csv',
    authenticateToken,
    checkOrgAccess("org.devices.view"),
    checkTelemetryReadAccess,
    csvRouteLimiter,
    checkPlanFeature('export'),
    telemetryController.exportCsv
);

/**
 * @swagger
 * /api/telemetry/db/{model}/{auid}/raw:
 *   get:
 *     tags: [Telemetry]
 *     summary: Get raw telemetry data (Enterprise Only)
 *     description: Returns raw JSON sensor data for auditing.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: model
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100 }
 *     responses:
 *       200:
 *         description: List of raw telemetry records
 *       403:
 *         description: Operation requiring Enterprise plan
 */
router.get('/db/:model/:auid/raw',
    authenticateToken,
    checkOrgAccess("org.devices.view"),
    checkTelemetryReadAccess,
    checkPlanFeature('apiAccess', 'full'), // Only Enterprise (full API access)
    telemetryController.getRawData
);

module.exports = router;
