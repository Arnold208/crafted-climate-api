const express = require('express');
const router = express.Router();
const telemetryController = require('../../../controllers/telemetryController');

// Middleware
const { dbRouteLimiter, csvRouteLimiter } = require('../../../middleware/rateLimiter');
const enforceTelemetryIngestion = require('../../../middleware/subscriptions/enforceTelemetryIngestion');
const enforceTelemetryFeature = require('../../../middleware/subscriptions/enforceTelemetryFeature');
const authenticateToken = require('../../../middleware/bearermiddleware');
const checkOrgAccess = require("../../../middleware/organization/checkOrgAccess");
const checkTelemetryReadAccess = require("../../../middleware/organization/checkTelemetryReadAccess");

/**
 * @swagger
 * /api/telemetry/{model}:
 *   post:
 *     tags: [Telemetry]
 *     summary: Submit short-keyed telemetry data
 *     description: Accepts telemetry data using short keys.
 *     parameters:
 *       - name: model
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [i]
 *             properties:
 *               i: { type: string }
 *     responses:
 *       201: { description: Telemetry stored }
 *       400: { description: Bad request }
 */
router.post('/:model', enforceTelemetryIngestion, telemetryController.ingest);

/**
 * @swagger
 * /api/telemetry/{userid}/device/{auid}:
 *   get:
 *     tags: [Telemetry]
 *     summary: Get telemetry and metadata for a device
 */
router.get('/:userid/device/:auid',
  // authenticateToken, // Uncomment when ready to enforce
  // checkOrgAccess("org.devices.view"),
  // checkTelemetryReadAccess,
  // enforceTelemetryFeature({ feature: "device_read" }), 
  telemetryController.getDeviceTelemetry
);

/**
 * @swagger
 * /api/telemetry/public/telemetry:
 *   get:
 *     tags: [Telemetry]
 *     summary: Get telemetry for public devices
 */
router.get('/public/telemetry', telemetryController.getPublicTelemetry);

/**
 * @swagger
 * /api/telemetry/db/{model}/{auid}:
 *   get:
 *     tags: [Telemetry]
 *     summary: Fetch historical telemetry from DB
 */
router.get('/db/:model/:auid',
  authenticateToken,
  checkOrgAccess("org.devices.view"),
  checkTelemetryReadAccess,
  enforceTelemetryFeature({ feature: "device_read" }),
  dbRouteLimiter,
  telemetryController.getDbTelemetry
);

/**
 * @swagger
 * /api/telemetry/db/{model}/{auid}/csv:
 *   get:
 *     tags: [Telemetry]
 *     summary: Download telemetry as CSV
 */
router.get('/db/:model/:auid/csv',
  authenticateToken,
  checkOrgAccess("org.devices.view"),
  checkTelemetryReadAccess,
  csvRouteLimiter,
  enforceTelemetryFeature({
    feature: "export",
    quotaKey: "monthlyExports",
    log: "monthlyExports"
  }),
  telemetryController.exportCsv
);

module.exports = router;
