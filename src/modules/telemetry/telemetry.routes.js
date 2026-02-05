const express = require('express');
const router = express.Router();
const telemetryController = require('./telemetry.controller');

// Middleware
const { dbRouteLimiter, csvRouteLimiter, publicTelemetryLimiter, ingestRouteLimiter } = require('../../middleware/rateLimiter');
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
 *     description: Accepts telemetry data using short keys. Uses the device ID ("i") to verify the registered device and stores only mapped datapoints.
 *     parameters:
 *       - in: path
 *         name: model
 *         required: true
 *         schema:
 *           type: string
 *         description: The model type of the device (e.g., env, gas, aqua).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               i: { type: string, description: "Device ID" }
 *               t: { type: number, description: "Temperature" }
 *               h: { type: number, description: "Humidity" }
 *               p: { type: number, description: "Pressure" }
 *               p1: { type: number, description: "PM1" }
 *               p2: { type: number, description: "PM2.5" }
 *               p10: { type: number, description: "PM10" }
 *               l: { type: number, description: "Lux" }
 *               u: { type: number, description: "UV" }
 *               s: { type: number, description: "Sound" }
 *               d: { type: integer, description: "Unix Timestamp" }
 *               e: { type: string, description: "Error Code" }
 *               b: { type: number, description: "Battery Level" }
 *           example:
 *             i: "device-id-123"
 *             t: 26.4
 *             h: 60.1
 *             p: 1013.2
 *             p1: 4.2
 *             p2: 18.7
 *             p10: 30.3
 *             l: 430
 *             u: 1.9
 *             s: 60
 *             d: 1721666400
 *             e: "0000"
 *             b: 85
 *     responses:
 *       201:
 *         description: Telemetry stored successfully
 *       400:
 *         description: Missing or invalid device ID
 *       404:
 *         description: Device not found
 *       500:
 *         description: Server error
 */
router.post('/:model', ingestRouteLimiter, enforceTelemetryIngestion, telemetryController.ingest);

/**
 * @swagger
 * /api/telemetry/{userid}/device/{auid}:
 *   get:
 *     tags: [Telemetry]
 *     summary: Get device telemetry summary
 *     description: Fetches telemetry entries and device metadata from Redis. Falls back to MongoDB if Redis is empty. Validates that the user has access to the device.
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema: { type: string }
 *         description: User ID requesting telemetry
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 *         description: Unique AUID of the device
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 50
 *         description: Limit the number of telemetry entries returned (max 50)
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 source: { type: string, example: "redis" }
 *                 metadata: { type: object }
 *                 count: { type: integer }
 *                 telemetry:
 *                   type: array
 *                   items: { type: object }
 */
router.get('/:userid/device/:auid',
    authenticateToken,
    checkOrgAccess("org.devices.view"),
    checkTelemetryReadAccess,
    telemetryController.getDeviceTelemetry
);

/**
 * @swagger
 * /api/telemetry/public/telemetry:
 *   get:
 *     tags: [Telemetry]
 *     summary: Get public telemetry data
 *     description: Retrieves cached telemetry data (capped per device) with metadata for devices marked public.
 *     parameters:
 *       - in: query
 *         name: model
 *         schema:
 *           type: string
 *         description: Filter devices by model (e.g., "env", "gas-solo")
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Max telemetry points per device (default 50)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count: { type: integer, example: 1 }
 *                 per_device_limit: { type: integer, example: 50 }
 *                 page: { type: integer, example: 1 }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       metadata:
 *                         type: object
 *                         properties:
 *                           auid: { type: string, example: "GH-XXXX" }
 *                           location: { type: string, example: "Lagos, Nigeria" }
 *                           model: { type: string, example: "env" }
 *                       telemetry:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             temperature: { type: number, example: 28.7 }
 *                             humidity: { type: number, example: 65.9 }
 *                             pressure: { type: number, example: 1009.43 }
 *                             pm2_5: { type: number, example: 12 }
 *                             aqi: { type: number, example: 50 }
 *                             timestamp: { type: string, example: "1721666400000" }
 */
router.get('/public/telemetry', publicTelemetryLimiter, telemetryController.getPublicTelemetry);

/**
 * @swagger
 * /api/telemetry/db/{model}/{auid}:
 *   get:
 *     tags: [Telemetry]
 *     summary: Get historical telemetry from database
 *     description: Retrieve telemetry data from the database for a given device auid and telemetry model.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: model
 *         required: true
 *         schema:
 *           type: string
 *           enum: [env, aqua, gasSolo]
 *           default: env
 *         description: Telemetry model (e.g. "env").
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 *         description: Device AUID (unique identifier).
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 2
 *         description: Maximum number of records to return.
 *       - in: query
 *         name: start
 *         schema: { type: string, format: date-time }
 *         description: Optional start date/time (ISO string or epoch).
 *       - in: query
 *         name: end
 *         schema: { type: string, format: date-time }
 *         description: Optional end date/time (ISO string or epoch).
 *     responses:
 *       200:
 *         description: Telemetry data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 model: { type: string }
 *                 auid: { type: string }
 *                 count: { type: integer }
 *                 telemetry:
 *                   type: array
 *                   items: { type: object }
 *       404:
 *         description: No telemetry data found for the given device or model.
 *       500:
 *         description: Server error.
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
 *     description: Streams telemetry rows for the given device AUID as CSV, sorted by transport_time descending (newest → oldest). Includes transport_time, telem_time, and all sensor fields. Optionally filter by a date range using start and/or end (applies to transport_time).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: model
 *         required: true
 *         schema:
 *           type: string
 *           enum: [env, aqua, gasSolo]
 *           default: env
 *         description: Telemetry model (currently only "env").
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 *         description: Device AUID.
 *       - in: query
 *         name: start
 *         schema: { type: string, format: date-time }
 *         description: Start of time range (inclusive). ISO 8601 or epoch milliseconds.
 *       - in: query
 *         name: end
 *         schema: { type: string, format: date-time }
 *         description: End of time range (inclusive). ISO 8601 or epoch milliseconds.
 *     responses:
 *       200:
 *         description: CSV stream (newest → oldest)
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               example: "auid,transport_time,telem_time,temperature,humidity,pressure,altitude,pm1,pm2_5,pm10,pm1s,pm2_5s,pm10s,lux,uv,sound,aqi,battery,error\nGH-XXXX,2025-09-23T18:00:00.000Z,2025-09-23T18:00:00.000Z,28.7,65.9,1009.43,0,0,0,0,0,0,0,15.67,38,0,0,27.5,00001"
 *       404:
 *         description: Unknown model.
 *       500:
 *         description: Server error.
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
