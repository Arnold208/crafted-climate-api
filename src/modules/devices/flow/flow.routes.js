const express = require('express');
const router = express.Router();
const flowController = require('./flow.controller');
const authenticateToken = require('../../../middleware/bearermiddleware');
const checkOrgAccess = require("../../../middleware/organization/checkOrgAccess");

/**
 * @swagger
 * tags:
 *   name: Flow Hub
 *   description: |
 *     Crowdsense Flow Hub Management (Irrigation Control).
 *     
 *     ### 🔌 Real-time WebSocket Protocol
 *     For lower latency and persistent connections, use the WebSocket server.
 *     
 *     **Connection:** `ws://{host}:3000` (or `wss://` in production)
 *     
 *     **Authentication:**
 *     - **Users:** Send `token: <JWT>` in the `auth` object.
 *     - **Devices:** Send `apiKey: <API_KEY>` in the `auth` object.
 *     
 *     **Flow Control Events:**
 *     1. `emit("join", auid)`: Join a device's room (required to send/receive).
 *     2. `emit("command:send", { auid, command: { pump: true|false } })`: Send a pump command (Users only).
 *     3. `on("command:receive", data)`: Listen for incoming commands (Devices only).
 *     4. `on("telemetry", data)`: Listen for live telemetry (Users only).
 */

/**
 * @swagger
 * /api/devices/flow/{auid}/config:
 *   get:
 *     tags: [Flow Hub]
 *     summary: Get current device configuration and schedules
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Config retrieved }
 */
router.get('/:auid/config', authenticateToken, checkOrgAccess("org.devices.view"), flowController.getDeviceConfig);

/**
 * @swagger
 * /api/devices/flow/{auid}/pump:
 *   post:
 *     tags: [Flow Hub]
 *     summary: Manual Pump Control
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pump: { type: boolean }
 *               op_mode: { type: string, enum: ["schedule", "remote", "manual"] }
 *     responses:
 *       200: { description: Pump state updated }
 */
router.post('/:auid/pump', authenticateToken, checkOrgAccess("org.devices.control"), flowController.updatePump);

/**
 * @swagger
 * /api/devices/flow/{auid}/op-mode:
 *   post:
 *     tags: [Flow Hub]
 *     summary: Update Device Operation Mode
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               op_mode: { type: string, enum: ["schedule", "remote", "manual"] }
 *     responses:
 *       200: { description: Operation mode updated }
 */
router.post('/:auid/op-mode', authenticateToken, checkOrgAccess("org.devices.control"), flowController.updateOpMode);

/**
 * @swagger
 * /api/devices/flow/{auid}/schedules:
 *   post:
 *     tags: [Flow Hub]
 *     summary: Add an irrigation schedule
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               startTime: { type: string, example: "08:00" }
 *               durationMinutes: { type: integer }
 *               days: { type: array, items: { type: string } }
 *     responses:
 *       201: { description: Schedule added }
 */
router.post('/:auid/schedules', authenticateToken, checkOrgAccess("org.devices.control"), flowController.addSchedule);

/**
 * @swagger
 * /api/devices/flow/{auid}/schedules/{scheduleId}:
 *   put:
 *     tags: [Flow Hub]
 *     summary: Update an irrigation schedule
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: scheduleId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: Schedule updated }
 */
router.put('/:auid/schedules/:scheduleId', authenticateToken, checkOrgAccess("org.devices.control"), flowController.updateSchedule);

/**
 * @swagger
 * /api/devices/flow/{auid}/schedules/{scheduleId}:
 *   delete:
 *     tags: [Flow Hub]
 *     summary: Delete an irrigation schedule
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: scheduleId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Schedule deleted }
 */
router.delete('/:auid/schedules/:scheduleId', authenticateToken, checkOrgAccess("org.devices.control"), flowController.deleteSchedule);

/**
 * @swagger
 * /api/devices/flow/sync/{devid}:
 *   get:
 *     tags: [Flow Hub]
 *     summary: Device Synchronization Endpoint (Public/Internal)
 *     description: Endpoint for the physical device to fetch its desired state and schedules.
 *     parameters:
 *       - in: path
 *         name: devid
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Sync data retrieved }
 *       404: { description: Config not found }
 */
router.get('/sync/:devid', flowController.syncConfig);

/**
 * @swagger
 * /api/devices/flow/{auid}/setup:
 *   put:
 *     tags: [Flow Hub]
 *     summary: Update device setup and configuration
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               setup:
 *                 type: object
 *                 properties:
 *                   requires_configuration: { type: boolean }
 *                   is_configured: { type: boolean }
 *                   wifi_configured: { type: boolean }
 *                   api_key_generated: { type: boolean }
 *                   tank_calibrated: { type: boolean }
 *                   tank_height_mm: { type: integer }
 *                   tank_volume_l: { type: integer }
 *               power_system:
 *                 type: object
 *                 properties:
 *                   architecture: { type: string }
 *                   capabilities:
 *                     type: object
 *                     properties:
 *                       solar: { type: boolean }
 *                       battery: { type: boolean }
 *                       ac_input: { type: boolean }
 *     responses:
 *       200: { description: Setup updated }
 */
router.put('/:auid/setup', authenticateToken, checkOrgAccess("org.devices.control"), flowController.updateSetup);

module.exports = router;
