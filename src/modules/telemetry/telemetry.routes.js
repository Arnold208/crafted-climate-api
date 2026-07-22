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
const { requirePermission } = require('../../middleware/authenticateApiKey');

const checkPlanFeature = require('../../middleware/subscriptions/checkPlanFeature');

// Routes

/**
 * @swagger
 * /api/telemetry/{model}:
 *   post:
 *     tags:
 *       - Telemetry
 *     summary: Ingest telemetry data
 *     description: |
 *       Ingests telemetry data from a device. Requires an **org API key** with `telemetry:write` permission
 *       (format: `x-api-key: cc_live_...`). JWT is **not** accepted on this endpoint — devices always authenticate
 *       via API key. The `model` path parameter identifies the sensor schema (e.g. ENV, AQUA).
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: model
 *         required: true
 *         schema:
 *           type: string
 *           example: "ENV"
 *         description: The telemetry model / sensor schema type.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               i:
 *                 type: string
 *                 example: "properties_example"
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Bad Request
 *       401:
 *         description: Missing or invalid API key
 *       404:
 *         description: Not Found
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Server Error
 */
/**
 * @swagger
 * /api/telemetry/satellite/ingest:
 *   post:
 *     tags:
 *       - Telemetry
 *     summary: Ingest satellite telemetry from UDP gateway
 *     description: |
 *       Ingests decoded telemetry packets sent by the local/cloud Satellite UDP Gateway server.
 *       Identifies registered device by `device_id` (`devid`, `auid`, or `serial`).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               device_id: { type: string, example: "AFRI-NTN-001" }
 *               received_utc: { type: string, example: "2026-07-21T03:22:28.123Z" }
 *               source_ip: { type: string, example: "127.0.0.1" }
 *               source_port: { type: integer, example: 5005 }
 *               received_via: { type: string, example: "local_udp_gateway_test" }
 *               payload: { type: object }
 *     responses:
 *       201:
 *         description: Telemetry ingested successfully
 *       400:
 *         description: Missing or invalid device_id or payload
 *       404:
 *         description: Device not found
 */
router.post('/satellite/ingest', ingestRouteLimiter, telemetryController.ingestSatellite);
router.post('/satellite', ingestRouteLimiter, telemetryController.ingestSatellite);

router.post('/:model', ingestRouteLimiter, requirePermission('telemetry:write'), enforceTelemetryIngestion, telemetryController.ingest);

/**
 * @swagger
 * /api/telemetry/{userid}/device/{auid}:
 *   get:
 *     tags: [Telemetry]
 *     summary: Get device telemetry summary
 *     description: Fetches telemetry entries and device metadata from Redis. Falls back to MongoDB if Redis is empty. Validates that the user has access to the device. Accepts **JWT Bearer** or **org API key** (`telemetry:read`).
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema: { type: string, example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }
 *         description: User ID requesting telemetry
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string, example: "GH-ENV-12345XYZ" }
 *         description: Unique AUID of the device
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
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
 *                 count: { type: integer, example: 1 }
 *                 telemetry:
 *                   type: array
 *                   example: ["example_value"]
 *                   items: { type: object }
 *       403:
 *         description: Forbidden - Device requires configuration
 *       404:
 *         description: Not Found
 */
router.get('/:userid/device/:auid',
    authenticateToken,
    requirePermission('telemetry:read'),
    checkOrgAccess("org.devices.view"),
    checkTelemetryReadAccess,
    telemetryController.getDeviceTelemetry
);

/**
 * @swagger
 * /api/telemetry/{userid}/device/{auid}:
 *   delete:
 *     tags: [Telemetry]
 *     summary: Delete all telemetry for a device
 *     description: Deletes all telemetry data for a specific device from both Redis cache and MongoDB. Requires Owner or Org Admin privileges. Accepts **JWT Bearer** or **org API key** (`telemetry:write`).
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema: { type: string, example: "user-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }
 *         description: User ID (must match owner or authorized admin)
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string, example: "GH-ENV-12345XYZ" }
 *         description: Device AUID
 *     responses:
 *       200:
 *         description: Telemetry deleted successfully
 *       403:
 *         description: Unauthorized
 *       404:
 *         description: Device not found
 */
router.delete('/:userid/device/:auid',
    authenticateToken,
    requirePermission('telemetry:write'),
    checkOrgAccess("org.devices.edit"),
    telemetryController.deleteDeviceTelemetry
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
 *           example: "ENV"
 *         description: Filter devices by model (e.g., "env", "gas-solo")
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *           default: 50
 *         description: Max telemetry points per device (default 50)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
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
 *     description: Retrieve telemetry data from the database for a given device auid and telemetry model. Accepts **JWT Bearer** or **org API key** (`telemetry:read`).
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: model
 *         required: true
 *         schema:
 *           type: string
 *           example: "ENV"
 *           enum: [env, aqua, gas-solo, flow]
 *           default: env
 *         description: Telemetry model (e.g. "env").
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string, example: "GH-ENV-12345XYZ" }
 *         description: Device AUID (unique identifier).
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *           default: 2
 *         description: Maximum number of records to return.
 *       - in: query
 *         name: start
 *         schema: { type: string, example: "2026-06-01T00:00:00Z", format: date-time }
 *         description: Optional start date/time (ISO string or epoch).
 *       - in: query
 *         name: end
 *         schema: { type: string, example: "2026-06-12T00:00:00Z", format: date-time }
 *         description: Optional end date/time (ISO string or epoch).
 *     responses:
 *       200:
 *         description: Telemetry data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 model: { type: string, example: "ENV" }
 *                 auid: { type: string, example: "GH-ENV-12345XYZ" }
 *                 count: { type: integer, example: 1 }
 *                 telemetry:
 *                   type: array
 *                   example: ["example_value"]
 *                   items: { type: object }
 *       403:
 *         description: Forbidden - Device requires configuration
 *       404:
 *         description: No telemetry data found for the given device or model.
 *       500:
 *         description: Server error.
 */
router.get('/db/:model/:auid',
    authenticateToken,
    requirePermission('telemetry:read'),
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
 *     description: Streams telemetry rows for the given device AUID as CSV, sorted by transport_time descending (newest → oldest). Includes transport_time, telem_time, and all sensor fields. Optionally filter by a date range using start and/or end (applies to transport_time). Accepts **JWT Bearer** or **org API key** (`telemetry:read` + `export` plan feature).
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: model
 *         required: true
 *         schema:
 *           type: string
 *           example: "ENV"
 *           enum: [env, aqua, gas-solo, flow]
 *           default: env
 *         description: Telemetry model (env, aqua, gas-solo, flow).
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string, example: "GH-ENV-12345XYZ" }
 *         description: Device AUID.
 *       - in: query
 *         name: start
 *         schema: { type: string, example: "2026-06-01T00:00:00Z", format: date-time }
 *         description: Start of time range (inclusive). ISO 8601 or epoch milliseconds.
 *       - in: query
 *         name: end
 *         schema: { type: string, example: "2026-06-12T00:00:00Z", format: date-time }
 *         description: End of time range (inclusive). ISO 8601 or epoch milliseconds.
 *     responses:
 *       200:
 *         description: CSV stream (newest → oldest)
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               example: "auid,devid,transport_time,telem_time,pump,manual,op_mode,health,sensor_ok,sleeping,sleep_enabled,stop_reason,tank_full,tank_empty,tank_mm,tank_l,bat_v,bat_ma,bat_mw,next_cycle,ps_duration,ps_avg_ma,ps_avg_mw,ps_min_v,ps_max_v,ps_samples\nGH-XXXX,3af01,2025-09-23T18:00:00.000Z,2025-09-23T18:00:00.000Z,false,false,schedule,0000,true,false,false,none,false,false,220,16.8,13.02,44.1,573.2,2025-09-23T18:30:00.000Z,173,854.2,10891,12.21,12.89,173"
 *       403:
 *         description: Forbidden - Device requires configuration
 *       404:
 *         description: Unknown model.
 *       500:
 *         description: Server error.
 */
router.get('/db/:model/:auid/csv',
    authenticateToken,
    requirePermission('telemetry:read'),
    checkOrgAccess("org.telemetry.export"),
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
 *     description: |
 *       Returns raw JSON sensor data for auditing. Requires Enterprise plan (apiAccess full).
 *       Accepts JWT Bearer or org API key with telemetry:read permission.

 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: model
 *         required: true
 *         schema: { type: string, example: "ENV" }
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string, example: "GH-ENV-12345XYZ" }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 10, default: 100 }
 *     responses:
 *       200:
 *         description: List of raw telemetry records
 *       403:
 *         description: Operation requiring Enterprise plan
 */
router.get('/db/:model/:auid/raw',
    authenticateToken,
    requirePermission('telemetry:read'),
    checkOrgAccess("org.devices.view"),
    checkTelemetryReadAccess,
    checkPlanFeature('apiAccess', 'full'), // Only Enterprise (full API access)
    telemetryController.getRawData
);

/**
 * @swagger
 * /api/telemetry/graph/{model}/{auid}:
 *   get:
 *     tags:
 *       - Telemetry
 *     summary: Get graph data
 *     description: Returns aggregated time-series telemetry for charting. Accepts **JWT Bearer** or **org API key** (`telemetry:read`).
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: model
 *         required: true
 *         schema:
 *           type: string
 *           example: "ENV"
 *       - in: path
 *         name: auid
 *         required: true
 *         schema:
 *           type: string
 *           example: "GH-ENV-12345XYZ"
 *       - in: query
 *         name: start
 *         required: true
 *         schema:
 *           type: string
 *           example: "2023-10-27T10:00:00.000Z"
 *         description: Start time (ISO 8601 or similar)
 *       - in: query
 *         name: end
 *         required: true
 *         schema:
 *           type: string
 *           example: "2023-10-27T12:00:00.000Z"
 *         description: End time (ISO 8601 or similar)
 *     responses:
 *       200:
 *         description: OK
 */

router.get('/graph/:model/:auid',
    authenticateToken,
    requirePermission('telemetry:read'),
    checkOrgAccess("org.devices.view"),
    checkTelemetryReadAccess,
    dbRouteLimiter,
    telemetryController.getGraphData
);

module.exports = router;
