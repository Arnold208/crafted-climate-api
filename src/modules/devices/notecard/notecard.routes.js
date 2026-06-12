const express = require('express');
const router = express.Router();
const notecardController = require('./notecard.controller');

const authenticateToken  = require('../../../middleware/bearermiddleware');
const checkOrgAccess     = require('../../../middleware/organization/checkOrgAccess');

// ─────────────────────────────────────────────────────────────────────────────
// SWAGGER TAG
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * tags:
 *   name: Notecard
 *   description: |
 *     Blues Notecard / Notehub integration. Allows pushing and reading
 *     environment variables on physical Notecard devices over-the-air.
 *
 *     **Well-known platform env vars (firmware contract):**
 *     | Key           | Type    | Description                                            |
 *     |---------------|---------|--------------------------------------------------------|
 *     | `CC_STATE`    | string  | `active` / `inactive` / `disabled` — device power state |
 *     | `CC_FREQUENCY`| integer | Recording interval in minutes                          |
 *     | `CC_BATCH`    | integer | Number of measurements to buffer before transmitting   |
 */

// ─────────────────────────────────────────────────────────────────────────────
// DEVICE ENV
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/devices/{auid}/notehub-env:
 *   put:
 *     tags: [Notecard]
 *     summary: Push environment variables to a single device
 *     description: |
 *       Pushes environment variables to the Notecard device identified by `auid` via Notehub.
 *       
 *       **Key Normalization:** All environment variable keys are normalized to uppercase (e.g. `cc_frequency` -> `CC_FREQUENCY`).
 *       
 *       **MongoDB Synchronization:** Updating `CC_FREQUENCY`, `CC_BATCH`, or `CC_STATE` will automatically sync and persist those configurations back to the device's main document in MongoDB, invalidating the metadata cache.
 *       
 *       **Deployment Fleet Inheritance:** If the device is currently assigned to a deployment, fleet-governed variables (`CC_FREQUENCY`, `CC_BATCH`, `CC_INBOUND`, `CC_OUTBOUND`) will be saved in MongoDB but automatically stripped from the device-level push to Notehub, allowing the device to continue inheriting those variables from the Deployment Fleet.
 *
 *       **Permission required:** Device owner OR collaborator with `edit` role
 *       OR org member with `org.notecard.edit` permission.
 *
 *       Devices without a `noteDevUuid` (not Notecard-based) are skipped
 *       gracefully — no error is thrown.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string, example: "GH-ENV-12345XYZ" }
 *         description: Device AUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: |
 *               Key-value map of environment variables to push.
 *               You may pass any keys your firmware supports.
 *             example:
 *               CC_STATE: active
 *               CC_FREQUENCY: 10
 *               CC_BATCH: 6
 *               custom_threshold: 35
 *     responses:
 *       200:
 *         description: Env vars pushed (or skipped if not Notecard-enabled)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 auid:         { type: string, example: "GH-ENV-12345XYZ" }
 *                 noteDevUuid:  { type: string, example: "noteDevUuid_example" }
 *                 projectUid:   { type: string, example: "projectUid_example" }
 *                 updated:      { type: object }
 *                 skipped:      { type: boolean, example: true }
 *                 reason:       { type: string, example: "reason_example", description: "Set when skipped=true" }
 *                 notehubResponse: { type: object }
 *       403: { description: Forbidden }
 *       404: { description: Device not found }
 */
// ─────────────────────────────────────────────────────────────────────────────
// STATIC ROUTES FIRST — must come before /:auid to avoid path conflicts
// ─────────────────────────────────────────────────────────────────────────────

// Deployment models listing
router.get('/deployments/:deploymentId/models',
    authenticateToken,
    checkOrgAccess('org.notecard.view'),
    notecardController.getDeploymentModels
);

// Deployment bulk env push
router.put('/deployments/:deploymentId/notehub-env',
    authenticateToken,
    checkOrgAccess('org.notecard.edit'),
    notecardController.updateDeploymentEnv
);

// Organization bulk env push
router.put('/organizations/:orgId/notehub-env',
    authenticateToken,
    checkOrgAccess('org.notecard.edit'),
    notecardController.updateOrganizationEnv
);

// ─────────────────────────────────────────────────────────────────────────────
// DEVICE ENV — dynamic /:auid routes (must be AFTER static routes above)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:auid/notehub-env',
    authenticateToken,
    checkOrgAccess('org.notecard.edit'),
    notecardController.updateDeviceEnv
);

/**
 * @swagger
 * /api/devices/{auid}/notehub-env:
 *   get:
 *     tags: [Notecard]
 *     summary: Get current environment variables of a device from Notehub
 *     description: |
 *       Reads the current environment variables stored on Notehub for the
 *       specified device. Requires `org.notecard.view` permission.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string, example: "GH-ENV-12345XYZ" }
 *         description: Device AUID
 *     responses:
 *       200:
 *         description: Current env vars from Notehub
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 auid:        { type: string, example: "GH-ENV-12345XYZ" }
 *                 noteDevUuid: { type: string, example: "noteDevUuid_example" }
 *                 projectUid:  { type: string, example: "projectUid_example" }
 *                 data:        { type: object, description: "Raw Notehub response" }
 *                 skipped:     { type: boolean, example: true }
 *                 reason:      { type: string, example: "reason_example" }
 *       403: { description: Forbidden }
 *       404: { description: Device not found }
 */
router.get('/:auid/notehub-env',
    authenticateToken,
    checkOrgAccess('org.notecard.view'),
    notecardController.getDeviceEnv
);

/**
 * @swagger
 * /api/devices/{auid}/notehub-env/{key}:
 *   delete:
 *     tags: [Notecard]
 *     summary: Delete a specific environment variable from a device on Notehub
 *     description: |
 *       Removes a single env var key from the device's Notehub environment.
 *       The Notecard firmware will revert to its default behavior for that key
 *       on the next sync.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema: { type: string, example: "GH-ENV-12345XYZ" }
 *         description: Device AUID
 *       - in: path
 *         name: key
 *         required: true
 *         schema: { type: string, example: "key_example" }
 *         description: Env var key to delete (e.g. `CC_STATE`)
 *     responses:
 *       200:
 *         description: Env var deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:     { type: string, example: "This is a status update notification." }
 *                 auid:        { type: string, example: "GH-ENV-12345XYZ" }
 *                 noteDevUuid: { type: string, example: "noteDevUuid_example" }
 *                 deletedKey:  { type: string, example: "deletedKey_example" }
 *       403: { description: Forbidden }
 *       404: { description: Device not found }
 */
router.delete('/:auid/notehub-env/:key',
    authenticateToken,
    checkOrgAccess('org.notecard.delete'),
    notecardController.deleteDeviceEnv
);

// ─────────────────────────────────────────────────────────────────────────────
// DEPLOYMENT ENV
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/notehub-env:
 *   put:
 *     tags: [Notecard]
 *     summary: Bulk push environment variables to all devices of a model in a deployment
 *     description: |
 *       Pushes env vars to every device of the specified model in the deployment.
 *       Devices without a `noteDevUuid` are silently skipped.
 *       Each device result reports `success`, `skipped`, or `error`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema: { type: string, example: "dep-starter-uuid" }
 *         description: Deployment ID
 *       - in: query
 *         name: model
 *         required: true
 *         schema:
 *           type: string
 *           example: "ENV"
 *           enum: [env, aqua, gas, gas-solo, flow, terra]
 *         description: Device model to target within the deployment
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Key-value map of env vars to push to all matching devices
 *             example:
 *               CC_FREQUENCY: 15
 *               CC_BATCH: 4
 *     responses:
 *       200:
 *         description: Results for each device in the deployment
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deploymentId:  { type: string, example: "dep-starter-uuid" }
 *                 model:         { type: string, example: "ENV" }
 *                 totalDevices:  { type: integer, example: 1 }
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       auid:   { type: string, example: "GH-ENV-12345XYZ" }
 *                       status: { type: string, example: "pending", enum: [success, skipped, error] }
 *                       reason: { type: string, example: "reason_example" }
 *                       error:  { type: string, example: "error_example" }
 *       400: { description: Missing model query param }
 *       403: { description: Forbidden }
 *       404: { description: Deployment not found }
 */
/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/models:
 *   get:
 *     tags: [Notecard]
 *     summary: Get distinct device models in a deployment
 *     description: |
 *       Returns the list of distinct device models in the deployment,
 *       along with Notecard coverage stats (how many have a noteDevUuid).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema: { type: string, example: "dep-starter-uuid" }
 *     responses:
 *       200:
 *         description: Models and Notecard stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deploymentId:            { type: string, example: "dep-starter-uuid" }
 *                 models:                  { type: array, example: ["example_value"], items: { type: string } }
 *                 totalDevices:            { type: integer, example: 1 }
 *                 notecardEnabledDevices:  { type: integer, example: 1 }
 *                 nonNotecardDevices:      { type: integer, example: 1 }
 *       404: { description: Deployment not found }
 */
// ─────────────────────────────────────────────────────────────────────────────
// ORGANIZATION ENV
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/devices/organizations/{orgId}/notehub-env:
 *   put:
 *     tags: [Notecard]
 *     summary: Bulk push environment variables to ALL Notecard devices in an organization
 *     description: |
 *       Pushes env vars to every Notecard-enabled device in the organization.
 *       Optionally filter by model using the `?model=` query param.
 *       Non-Notecard devices (no noteDevUuid) are silently skipped.
 *
 *       **Permission required:** `org.notecard.edit`
 *
 *       **Use cases:**
 *       - Push a global `CC_STATE: inactive` for maintenance
 *       - Update `CC_FREQUENCY` for all ENV devices in the org at once
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string, example: "org-starter-uuid" }
 *         description: Organization ID
 *       - in: query
 *         name: model
 *         required: false
 *         schema:
 *           type: string
 *           example: "ENV"
 *           enum: [env, aqua, gas, gas-solo, flow, terra]
 *         description: Optional — filter by device model. Omit to target all models.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Key-value map of env vars to push to all matching devices
 *             example:
 *               CC_STATE: inactive
 *               CC_FREQUENCY: 30
 *               CC_BATCH: 2
 *     responses:
 *       200:
 *         description: Results for each device in the organization
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orgId:        { type: string, example: "org-starter-uuid" }
 *                 model:        { type: string, example: "ENV" }
 *                 totalDevices: { type: integer, example: 1 }
 *                 summary:
 *                   type: object
 *                   properties:
 *                     success: { type: integer, example: 1 }
 *                     skipped: { type: integer, example: 1 }
 *                     error:   { type: integer, example: 1 }
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       auid:     { type: string, example: "GH-ENV-12345XYZ" }
 *                       nickname: { type: string, example: "nickname_example" }
 *                       status:   { type: string, example: "pending", enum: [success, skipped, error] }
 *                       reason:   { type: string, example: "reason_example" }
 *                       error:    { type: string, example: "error_example" }
 *       400: { description: Missing or invalid request body }
 *       403: { description: Forbidden — org context mismatch }
 */

module.exports = router;
