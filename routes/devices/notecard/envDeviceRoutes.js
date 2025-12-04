const express = require('express');
const axios = require('axios');
const registerNewDevice = require('../../../model/devices/registerDevice');
const dotenv = require('dotenv');
const path = require('path');

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
const NOTEHUB_PROJECT_UID = process.env.NOTEHUB_PROJECT_UID;
const NOTEHUB_BASE_URL = process.env.NOTEHUB_BASE_URL || 'https://api.notefile.net';

if (!NOTEHUB_API_KEY || !NOTEHUB_PROJECT_UID) {
  console.warn('⚠️ Missing Notehub credentials. Please set NOTEHUB_API_KEY and NOTEHUB_PROJECT_UID in your .env.');
}

/**
 * @swagger
 * /api/devices/update-notehub-env:
 *   put:
 *     tags:
 *       - Device Config
 *     summary: Update Notehub environment variables for a user's device
 *     description: |
 *       Allows the device owner to update Notecard environment variables (e.g., ANTI_THEFT, DEV_SLP_MIN, NOTE_IN_MIN, NOTE_OUT_MIN).
 *       This request is securely proxied through the server to Notehub.
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
 *                 example:
 *                   anti_theft_enabled: "true"
 *                   sync_interval_min: "10"
 *                   note_in_min: "10"
 *                   theft_buzzer_duration: "30"
 *     responses:
 *       200:
 *         description: Environment variables updated successfully on Notehub.
 *       400:
 *         description: Missing parameters or invalid request.
 *       403:
 *         description: User not authorized to modify this device.
 *       404:
 *         description: Device not found or missing Notehub UUID.
 *       500:
 *         description: Error communicating with Notehub.
 */
router.put('/update-notehub-env', async (req, res) => {
  const { auid, envVars } = req.body;
  const { userid } = req.query;

  if (!userid || !auid || !envVars || typeof envVars !== 'object') {
    return res.status(400).json({
      message: 'Missing required parameters: "userid", "auid", and a valid "envVars" object.',
    });
  }

  try {
    const device = await registerNewDevice.findOne({ auid, userid });
    if (!device) return res.status(403).json({ message: 'Device not found or not owned by the provided user.' });

    if (!device.noteDevUuid) {
      return res.status(404).json({ message: 'Device missing associated Notehub UUID (noteDevUuid).' });
    }

    const url = `${NOTEHUB_BASE_URL}/v1/projects/${NOTEHUB_PROJECT_UID}/devices/${device.noteDevUuid}/environment_variables`;

    const response = await axios.put(
      url,
      { environment_variables: envVars },
      {
        headers: { 'Content-Type': 'application/json', 'X-Session-Token': NOTEHUB_API_KEY },
        timeout: 10000,
      }
    );

    res.status(200).json({
      message: 'Environment variables updated successfully on Notehub.',
      noteDevUuid: device.noteDevUuid,
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
});

/**
 * @swagger
 * /api/devices/get-notehub-env/{auid}:
 *   get:
 *     tags:
 *       - Device Config
 *     summary: Get Notehub environment variables for a user's device
 *     description: Retrieves the current environment variables for a user's device from Notehub via server proxy.
 *     parameters:
 *       - name: auid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique AUID of the registered device.
 *         example: "AUID12345"
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
 *       400:
 *         description: Missing or invalid parameters.
 *       403:
 *         description: User not authorized to access this device.
 *       404:
 *         description: Device not found or missing Notehub UUID.
 *       500:
 *         description: Error fetching environment variables from Notehub.
 */
router.get('/get-notehub-env/:auid', async (req, res) => {
  const { auid } = req.params;
  const { userid } = req.query;

  if (!userid || !auid) {
    return res.status(400).json({ message: 'Both "userid" and "auid" are required.' });
  }

  try {
    const device = await registerNewDevice.findOne({ auid, userid });
    if (!device) return res.status(403).json({ message: 'Device not found or not owned by this user.' });

    if (!device.noteDevUuid) {
      return res.status(404).json({ message: 'Device missing associated Notehub UUID (noteDevUuid).' });
    }

    const url = `${NOTEHUB_BASE_URL}/v1/projects/${NOTEHUB_PROJECT_UID}/devices/${device.noteDevUuid}/environment_variables`;
    const response = await axios.get(url, {
      headers: { 'X-Session-Token': NOTEHUB_API_KEY },
      timeout: 10000,
    });

    res.status(200).json({
      message: 'Environment variables retrieved successfully.',
      noteDevUuid: device.noteDevUuid,
      data: response.data,
    });
  } catch (error) {
    console.error('❌ Error retrieving Notehub environment variables:', error.message);
    res.status(error.response?.status || 500).json({
      message: 'Failed to retrieve environment variables from Notehub.',
      error: error.response?.data || error.message,
    });
  }
});

/**
 * @swagger
 * /api/devices/delete-notehub-env/{auid}/{key}:
 *   delete:
 *     tags:
 *       - Device Config
 *     summary: Delete a specific Notehub environment variable for a user's device
 *     description: Allows a user to delete a specific environment variable on Notehub for their device.
 *     parameters:
 *       - name: auid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Device AUID.
 *         example: "AUID12345"
 *       - name: key
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Environment variable key to delete.
 *         example: "ANTI_THEFT"
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
 *       400:
 *         description: Missing or invalid parameters.
 *       403:
 *         description: User not authorized to access this device.
 *       404:
 *         description: Device not found or missing Notehub UUID.
 *       500:
 *         description: Error deleting environment variable from Notehub.
 */
router.delete('/delete-notehub-env/:auid/:key', async (req, res) => {
  const { auid, key } = req.params;
  const { userid } = req.query;

  if (!userid || !auid || !key) {
    return res.status(400).json({ message: 'Parameters "userid", "auid", and "key" are required.' });
  }

  try {
    const device = await registerNewDevice.findOne({ auid, userid });
    if (!device) return res.status(403).json({ message: 'Device not found or not owned by this user.' });

    if (!device.noteDevUuid) {
      return res.status(404).json({ message: 'Device missing associated Notehub UUID (noteDevUuid).' });
    }

    const url = `${NOTEHUB_BASE_URL}/v1/projects/${NOTEHUB_PROJECT_UID}/devices/${device.noteDevUuid}/environment_variables/${key}`;
    const response = await axios.delete(url, {
      headers: { 'X-Session-Token': NOTEHUB_API_KEY },
      timeout: 10000,
    });

    res.status(200).json({
      message: `Environment variable "${key}" deleted successfully from Notehub.`,
      noteDevUuid: device.noteDevUuid,
      notehubResponse: response.data || 'Deleted',
    });
  } catch (error) {
    console.error('❌ Error deleting Notehub environment variable:', error.message);
    res.status(error.response?.status || 500).json({
      message: 'Failed to delete environment variable from Notehub.',
      error: error.response?.data || error.message,
    });
  }
});


module.exports = router;
