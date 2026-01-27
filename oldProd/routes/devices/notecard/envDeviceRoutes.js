// routes/api/devices/notehubEnvRoutes.js

const express = require('express');
const axios = require('axios');
const registerNewDevice = require('../../../model/devices/registerDevice');
const Organization = require('../../../model/organization/organizationModel');
const dotenv = require('dotenv');
const path = require('path');

// Middleware imports
const authenticateToken = require('../../../middleware/bearermiddleware');
const checkOrgAccess = require('../../../middleware/organization/checkOrgAccess');

let envFile;

if (process.env.NODE_ENV === 'development') {
  envFile = '.env.development';
} else {
  envFile = '.env';   // default for production or if NODE_ENV not set
}

dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });

const router = express.Router();

// --- Global Device Configuration ---
const NOTEHUB_API_KEY = process.env.NOTEHUB_API_KEY;
const NOTEHUB_PROJECT_UID = process.env.NOTEHUB_PROJECT_UID;   // Default for ENV / TERRA / GAS
const AQUA_PROJECT_UID  = process.env.AQUA_PROJECT_UID;        // Special project for AQUA devices
const NOTEHUB_BASE_URL  = process.env.NOTEHUB_BASE_URL || 'https://api.notefile.net';

if (!NOTEHUB_API_KEY) {
  console.warn('⚠️ Missing NOTEHUB_API_KEY. Please set NOTEHUB_API_KEY in your .env.');
}
if (!NOTEHUB_PROJECT_UID) {
  console.warn('⚠️ Missing NOTEHUB_PROJECT_UID (default project for env/terra/gas).');
}
if (!AQUA_PROJECT_UID) {
  console.warn('⚠️ Missing AQUA_PROJECT_UID (project for aqua devices).');
}

/**
 * Helper: choose the correct Notehub project UID based on device.model
 *   - env, terra, gas  -> NOTEHUB_PROJECT_UID
 *   - aqua             -> AQUA_PROJECT_UID
 */
function getProjectUidForDevice(device) {
  if (!device || !device.model) return null;

  const baseModel = device.model.toLowerCase(); // env, aqua, terra, gas

  if (baseModel === 'aqua') {
    return AQUA_PROJECT_UID || null;
  }

  // Default for env, terra, gas
  return NOTEHUB_PROJECT_UID || null;
}

/**
 * Validate that device belongs to the user's organization
 * Returns { valid: boolean, device?: object, message?: string }
 */
async function validateDeviceInOrg(auid, userid, orgId) {
  try {
    const device = await registerNewDevice.findOne({ auid, userid });
    if (!device) {
      return { valid: false, message: 'Device not found or not owned by user' };
    }

    // Check if device's organization matches user's organization
    if (device.organizationId && device.organizationId !== orgId) {
      return { valid: false, message: 'Device does not belong to this organization' };
    }

    return { valid: true, device };
  } catch (err) {
    return { valid: false, message: 'Error validating device' };
  }
}


/**
 * @swagger
 * /api/devices/update-notehub-env:
 *   put:
 *     tags:
 *       - Device Config
 *     summary: Update Notehub environment variables for a user's device
 *     description: |
 *       Allows the device owner to update Notecard environment variables for a specific device.
 *       
 *       The backend will:
 *       - Look up the device by AUID and userid in the `registerNewDevice` collection  
 *       - Detect the device model (`env`, `aqua`, `terra`, `gas`)  
 *       - Route the request to the appropriate Notehub project:
 *         - `env`, `terra`, `gas` → `NOTEHUB_PROJECT_UID`
 *         - `aqua` → `AQUA_PROJECT_UID`
 *       - Forward the environment variable update to Notehub via REST.
 *     parameters:
 *       - name: userid
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique user ID that owns the device.
 *         example: "USER12345"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - auid
 *               - envVars
 *             properties:
 *               auid:
 *                 type: string
 *                 description: Unique AUID of the device.
 *                 example: "GH-Y24SD"
 *               envVars:
 *                 type: object
 *                 description: Key-value pairs of environment variables to update.
 *                 additionalProperties:
 *                   type: string
 *                 example:
 *                   anti_theft_enabled: "true"
 *                   sync_interval_min: "10"
 *                   note_in_min: "10"
 *                   note_out_min: "10"
 *                   theft_buzzer_duration: "30"
 *     responses:
 *       200:
 *         description: Environment variables updated successfully on Notehub.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 noteDevUuid:
 *                   type: string
 *                 projectUid:
 *                   type: string
 *                   description: Notehub project UID used for this device.
 *                 updated:
 *                   type: object
 *                 notehubResponse:
 *                   type: object
 *       400:
 *         description: Missing parameters or invalid request body.
 *       403:
 *         description: Device not found or not owned by the user.
 *       404:
 *         description: Device not found or missing Notehub UUID.
 *       500:
 *         description: Error communicating with Notehub.
 */
router.put(
  '/update-notehub-env',
  authenticateToken,
  checkOrgAccess('org.notecard.edit'),
  async (req, res) => {
    const { auid, envVars } = req.body;
    const { userid } = req.query;
    const orgId = req.user.organizationId;

    if (!userid || !auid || !envVars || typeof envVars !== 'object') {
      return res.status(400).json({
        message: 'Missing required parameters: "userid", "auid", and a valid "envVars" object.',
      });
    }

    try {
      // Validate device belongs to organization
      const validation = await validateDeviceInOrg(auid, userid, orgId);
      if (!validation.valid) {
        return res.status(403).json({ message: validation.message });
      }

      const device = validation.device;

      if (!device.noteDevUuid) {
        return res.status(404).json({ message: 'Device missing associated Notehub UUID (noteDevUuid).' });
      }

      const projectUid = getProjectUidForDevice(device);
      if (!projectUid) {
        return res.status(500).json({
          message: 'No Notehub project UID configured for this device model.',
          model: device.model
        });
      }

      const url = `${NOTEHUB_BASE_URL}/v1/projects/${projectUid}/devices/${device.noteDevUuid}/environment_variables`;

      const response = await axios.put(
        url,
        { environment_variables: envVars },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Session-Token': NOTEHUB_API_KEY
          },
          timeout: 10000,
        }
      );

      res.status(200).json({
        message: 'Environment variables updated successfully on Notehub.',
        noteDevUuid: device.noteDevUuid,
        projectUid,
        updated: envVars,
        notehubResponse: response.data,
      });
    } catch (error) {
      console.error('❌ Error updating Notehub environment variables:', error.message);
      res.status(error.response?.status || 500).json({
        message: 'Failed to update environment variables on Notehub.',
        error: error.response?.data || error.message,
      });
    }
  }
);



/**
 * @swagger
 * /api/devices/get-notehub-env/{auid}:
 *   get:
 *     tags:
 *       - Device Config
 *     summary: Get Notehub environment variables for a user's device
 *     description: |
 *       Retrieves the current Notehub environment variables for a device.
 *       
 *       The backend will:
 *       - Look up the device by `auid` and `userid`  
 *       - Determine its model (`env`, `aqua`, `terra`, `gas`)  
 *       - Select the appropriate Notehub project UID:
 *         - `env`, `terra`, `gas` → `NOTEHUB_PROJECT_UID`
 *         - `aqua` → `AQUA_PROJECT_UID`
 *       - Fetch environment variables from Notehub and return them.
 *     parameters:
 *       - name: auid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique AUID of the registered device.
 *         example: "GH-Y24SD"
 *       - name: userid
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique user ID that owns the device.
 *         example: "USER12345"
 *     responses:
 *       200:
 *         description: Successfully retrieved environment variables from Notehub.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 noteDevUuid:
 *                   type: string
 *                 projectUid:
 *                   type: string
 *                 data:
 *                   type: object
 *                   description: Raw data returned from Notehub.
 *       400:
 *         description: Missing "userid" or "auid".
 *       403:
 *         description: Device not found or not owned by this user.
 *       404:
 *         description: Device not found or missing Notehub UUID.
 *       500:
 *         description: Error fetching environment variables from Notehub.
 */
router.get(
  '/get-notehub-env/:auid',
  authenticateToken,
  checkOrgAccess('org.notecard.view'),
  async (req, res) => {
    const { auid } = req.params;
    const { userid } = req.query;
    const orgId = req.user.organizationId;

    if (!userid || !auid) {
      return res.status(400).json({ message: 'Both "userid" and "auid" are required.' });
    }

    try {
      // Validate device belongs to organization
      const validation = await validateDeviceInOrg(auid, userid, orgId);
      if (!validation.valid) {
        return res.status(403).json({ message: validation.message });
      }

      const device = validation.device;

      if (!device.noteDevUuid) {
        return res.status(404).json({ message: 'Device missing associated Notehub UUID (noteDevUuid).' });
      }

      const projectUid = getProjectUidForDevice(device);
      if (!projectUid) {
        return res.status(500).json({
          message: 'No Notehub project UID configured for this device model.',
          model: device.model
        });
      }

      const url = `${NOTEHUB_BASE_URL}/v1/projects/${projectUid}/devices/${device.noteDevUuid}/environment_variables`;

      const response = await axios.get(url, {
        headers: { 'X-Session-Token': NOTEHUB_API_KEY },
        timeout: 10000,
      });

      res.status(200).json({
        message: 'Environment variables retrieved successfully.',
        noteDevUuid: device.noteDevUuid,
        projectUid,
        data: response.data,
      });
    } catch (error) {
      console.error('❌ Error retrieving Notehub environment variables:', error.message);
      res.status(error.response?.status || 500).json({
        message: 'Failed to retrieve environment variables from Notehub.',
        error: error.response?.data || error.message,
      });
    }
  }
);



/**
 * @swagger
 * /api/devices/delete-notehub-env/{auid}/{key}:
 *   delete:
 *     tags:
 *       - Device Config
 *     summary: Delete a specific Notehub environment variable for a user's device
 *     description: |
 *       Deletes a single Notehub environment variable for a device.
 *       
 *       The backend will:
 *       - Verify the device belongs to the user  
 *       - Determine the correct Notehub project UID based on the model  
 *       - Issue a DELETE request to Notehub for the selected key.
 *     parameters:
 *       - name: auid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Device AUID.
 *         example: "GH-Y24SD"
 *       - name: key
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Environment variable key to delete.
 *         example: "anti_theft_enabled"
 *       - name: userid
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID of the device owner.
 *         example: "USER12345"
 *     responses:
 *       200:
 *         description: Environment variable deleted successfully on Notehub.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 noteDevUuid:
 *                   type: string
 *                 projectUid:
 *                   type: string
 *                 notehubResponse:
 *                   type: object
 *       400:
 *         description: Missing "userid", "auid", or "key".
 *       403:
 *         description: Device not found or not owned by this user.
 *       404:
 *         description: Device not found or missing Notehub UUID.
 *       500:
 *         description: Error deleting environment variable from Notehub.
 */
router.delete(
  '/delete-notehub-env/:auid/:key',
  authenticateToken,
  checkOrgAccess('org.notecard.delete'),
  async (req, res) => {
    const { auid, key } = req.params;
    const { userid } = req.query;
    const orgId = req.user.organizationId;

    if (!userid || !auid || !key) {
      return res.status(400).json({ message: 'Parameters "userid", "auid", and "key" are required.' });
    }

    try {
      // Validate device belongs to organization
      const validation = await validateDeviceInOrg(auid, userid, orgId);
      if (!validation.valid) {
        return res.status(403).json({ message: validation.message });
      }

      const device = validation.device;

      if (!device.noteDevUuid) {
        return res.status(404).json({ message: 'Device missing associated Notehub UUID (noteDevUuid).' });
      }

      const projectUid = getProjectUidForDevice(device);
      if (!projectUid) {
        return res.status(500).json({
          message: 'No Notehub project UID configured for this device model.',
          model: device.model
        });
      }

      const url = `${NOTEHUB_BASE_URL}/v1/projects/${projectUid}/devices/${device.noteDevUuid}/environment_variables/${key}`;

      const response = await axios.delete(url, {
        headers: { 'X-Session-Token': NOTEHUB_API_KEY },
        timeout: 10000,
      });

      res.status(200).json({
        message: `Environment variable "${key}" deleted successfully from Notehub.`,
        noteDevUuid: device.noteDevUuid,
        projectUid,
        notehubResponse: response.data || 'Deleted',
      });
    } catch (error) {
      console.error('❌ Error deleting Notehub environment variable:', error.message);
      res.status(error.response?.status || 500).json({
        message: 'Failed to delete environment variable from Notehub.',
        error: error.response?.data || error.message,
      });
    }
  }
);


module.exports = router;
