const express = require('express');
const axios = require('axios');
const Deployment = require('../../../model/deployment/deploymentModel');
const RegisteredDevice = require('../../../model/devices/registerDevice');
const SensorModel = require('../../../model/devices/deviceModels');
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

const NOTEHUB_BASE_URL = process.env.NOTEHUB_BASE_URL || 'https://api.notefile.net';
const NOTEHUB_PROJECT_UID = process.env.NOTEHUB_PROJECT_UID;
const NOTEHUB_API_KEY = process.env.NOTEHUB_API_KEY;


/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/update-env:
 *   put:
 *     tags:
 *       - Device Config
 *     summary: Update Notehub environment variables for devices of a specific model in a deployment
 *     description: |
 *       Updates environment variables on Notehub for all devices in a deployment that match a specific model.  
 *       The user must provide:
 *       - deployment ID  
 *       - user ID  
 *       - target model name (validated against registered sensor models)
 *     parameters:
 *       - name: deploymentId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique ID of the deployment.
 *         example: "DEPLOY123"
 *       - name: userid
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique user ID that owns the deployment.
 *         example: "USER123"
 *       - name: model
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: The device model to target for update (must exist in registered sensor models).
 *         example: "esp32-xiao-c3"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
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
 *         description: Environment variables updated successfully for all matching devices.
 *       400:
 *         description: Missing parameters, invalid model, or no devices found.
 *       403:
 *         description: Unauthorized or deployment mismatch.
 *       404:
 *         description: Deployment or model not found.
 *       500:
 *         description: Internal server error.
 */

router.put('/deployments/:deploymentId/update-env', async (req, res) => {
    const { deploymentId } = req.params;
    const { userid, model } = req.query;
    const envVars = req.body.envVars || req.body; // allow flexible input

    // ✅ Validate input
    if (!userid || !deploymentId || !model) {
        return res.status(400).json({
            message: 'Missing required query parameters: "userid", "deploymentId", and "model".',
        });
    }

    if (!envVars || typeof envVars !== 'object' || Array.isArray(envVars) || Object.keys(envVars).length === 0) {
        return res.status(400).json({
            message: 'Invalid or empty environment variables. Must be a non-empty object.',
        });
    }

    try {
        // 1️⃣ Validate model against SensorModel collection
        const cleanModel = model.trim().toLowerCase();
        const validModel = await SensorModel.findOne({ model: cleanModel });
        if (!validModel) {
            return res.status(404).json({
                message: `Model "${cleanModel}" does not exist in registered sensor models.`,
            });
        }

        // 2️⃣ Verify that the deployment exists and belongs to the user
        const deployment = await Deployment.findOne({ deploymentid: deploymentId, userid });
        if (!deployment) {
            return res.status(403).json({
                message: 'Deployment not found or not owned by this user.',
            });
        }

        // 3️⃣ Get all devices listed in the deployment array
        const allDevices = [];

        for (const auid of deployment.devices) {
            //c/onsole.log(`🔍 Checking for device AUID: ${auid}`);

            const device = await RegisteredDevice.findOne({
                auid: auid, // use exact string (case-sensitive)
                model: { $regex: new RegExp(`^${cleanModel}$`, 'i') }, // case-insensitive match
            });

            if (device) {
                //console.log(`✅ Found device: ${device.auid} (${device.model})`);
                allDevices.push(device);
            } else {
                console.log(`⚠️ No match found for AUID: ${auid}`);
            }
        }

        //console.log(`📦 Total devices found: ${allDevices.length}`);

        if (allDevices.length === 0) {
            return res.status(404).json({
                message: `No devices found in deployment "${deploymentId}" with model "${cleanModel}".`,
            });
        }

        // 4️⃣ Update Notehub environment variables for each device
        const results = [];
        for (const device of allDevices) {
            if (!device.noteDevUuid) {
                results.push({
                    auid: device.auid,
                    model: cleanModel,
                    status: 'skipped',
                    reason: 'Missing Notehub UUID',
                });
                continue;
            }

            const url = `${NOTEHUB_BASE_URL}/v1/projects/${NOTEHUB_PROJECT_UID}/devices/${device.noteDevUuid}/environment_variables`;

            try {
                const response = await axios.put(
                    url,
                    { environment_variables: envVars },
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${NOTEHUB_API_KEY}`,
                        },
                        timeout: 10000,
                    }
                );

                results.push({
                    auid: device.auid,
                    model: cleanModel,
                    noteDevUuid: device.noteDevUuid,
                    status: 'success',
                    updatedVars: envVars,
                    notehubResponse: response.data,
                });
            } catch (err) {
                results.push({
                    auid: device.auid,
                    model: cleanModel,
                    noteDevUuid: device.noteDevUuid,
                    status: 'error',
                    error: err.response?.data || err.message,
                });
            }
        }

        // 5️⃣ Send back operation summary
        res.status(200).json({
            message: `Environment variables updated for ${results.filter((r) => r.status === 'success').length}/${allDevices.length} devices.`,
            deploymentId,
            model: cleanModel,
            totalDevices: allDevices.length,
            results,
        });
    } catch (error) {
        console.error('❌ Error updating Notehub environment variables:', error.message);
        res.status(500).json({
            message: 'Internal server error while updating environment variables.',
            error: error.message,
        });
    }
});


/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/models:
 *   get:
 *     tags:
 *       - Device Config
 *     summary: Get all unique device models in a deployment
 *     description: |
 *       Retrieves all unique device models currently present in a deployment.  
 *       Uses each device's AUID in the deployment to look up its model.  
 *       This helps users identify which models can be targeted for environment variable updates.
 *     parameters:
 *       - name: deploymentId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique ID of the deployment.
 *         example: "DEPLOY123"
 *       - name: userid
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID of the deployment owner.
 *         example: "USER123"
 *     responses:
 *       200:
 *         description: Successfully retrieved unique models in the deployment.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deploymentId:
 *                   type: string
 *                 totalModels:
 *                   type: integer
 *                 models:
 *                   type: array
 *                   items:
 *                     type: string
 *               example:
 *                 deploymentId: "DEPLOY123"
 *                 totalModels: 2
 *                 models: ["esp32-xiao-c3", "env"]
 *       400:
 *         description: Missing required parameters.
 *       403:
 *         description: Deployment not found or not owned by this user.
 *       404:
 *         description: No devices found in this deployment.
 *       500:
 *         description: Internal server error.
 */

router.get('/deployments/:deploymentId/models', async (req, res) => {
  const { deploymentId } = req.params;
  const { userid } = req.query;

  if (!userid || !deploymentId) {
    return res.status(400).json({
      message: 'Both "userid" and "deploymentId" are required.',
    });
  }

  try {
    // 1️⃣ Validate deployment ownership
    const deployment = await Deployment.findOne({ deploymentid: deploymentId, userid });
    if (!deployment) {
      return res.status(403).json({
        message: 'Deployment not found or not owned by this user.',
      });
    }

    // 2️⃣ Iterate over all AUIDs in the deployment and find their models
    const modelsFound = new Set();

    for (const auid of deployment.devices) {
      const device = await RegisteredDevice.findOne({ auid }).select('model');
      if (device && device.model) {
        modelsFound.add(device.model.trim().toLowerCase());
      }
    }

    if (modelsFound.size === 0) {
      return res.status(404).json({
        message: 'No devices found in this deployment.',
      });
    }

    // 3️⃣ Return unique models
    const uniqueModels = Array.from(modelsFound);

    res.status(200).json({
      deploymentId,
      totalModels: uniqueModels.length,
      models: uniqueModels,
    });
  } catch (error) {
    console.error('❌ Error fetching models in deployment:', error.message);
    res.status(500).json({
      message: 'Internal server error while retrieving models.',
      error: error.message,
    });
  }
});


/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/notehub-env:
 *   get:
 *     tags:
 *       - Device Config
 *     summary: Get Notehub environment variables for all devices in a deployment
 *     description: |
 *       Retrieves all environment variables for each device within a deployment.  
 *       Requires the deploymentId and the userId that owns the deployment.
 *     parameters:
 *       - name: deploymentId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique deployment ID.
 *         example: "DEPLOY123"
 *       - name: userid
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID that owns the deployment.
 *         example: "USER123"
 *     responses:
 *       200:
 *         description: Successfully retrieved environment variables for all devices in the deployment.
 *       400:
 *         description: Missing parameters.
 *       403:
 *         description: Deployment not found or not owned by the provided user.
 *       500:
 *         description: Error retrieving data from Notehub.
 */
router.get('/deployments/:deploymentId/notehub-env', async (req, res) => {
    const { deploymentId } = req.params;
    const { userid } = req.query;

    if (!deploymentId || !userid) {
        return res.status(400).json({ message: 'Both "deploymentId" and "userid" are required.' });
    }

    try {
        // 1️⃣ Ensure the deployment belongs to this user
        const deployment = await Deployment.findOne({ deploymentid: deploymentId, userid });
        if (!deployment) {
            return res.status(403).json({ message: 'Deployment not found or not owned by this user.' });
        }

        // 2️⃣ Get all devices in this deployment
        const devices = await RegisteredDevice.find({ auid: { $in: deployment.devices } });
        if (devices.length === 0) {
            return res.status(404).json({ message: 'No devices found in this deployment.' });
        }

        // 3️⃣ Fetch Notehub environment variables for each device
        const results = [];

        for (const device of devices) {
            if (!device.noteDevUuid) continue;

            const url = `${NOTEHUB_BASE_URL}/v1/projects/${NOTEHUB_PROJECT_UID}/devices/${device.noteDevUuid}/environment_variables`;
            try {
                const response = await axios.get(url, {
                    headers: { Authorization: `Bearer ${NOTEHUB_API_KEY}` },
                });
                results.push({
                    auid: device.auid,
                    noteDevUuid: device.noteDevUuid,
                    model: device.model,
                    environment: response.data.environment_variables || {},
                });
            } catch (err) {
                results.push({
                    auid: device.auid,
                    noteDevUuid: device.noteDevUuid,
                    model: device.model,
                    error: err.response?.data || err.message,
                });
            }
        }

        res.status(200).json({
            deploymentId,
            totalDevices: devices.length,
            results,
        });
    } catch (error) {
        console.error('❌ Error fetching deployment envs:', error.message);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});


/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/notehub-env/{key}:
 *   delete:
 *     tags:
 *       - Device Config
 *     summary: Delete an environment variable across all devices in a deployment
 *     description: |
 *       Deletes a specific environment variable from every device within a deployment.  
 *       Requires the deploymentId, the userId, and the key of the environment variable to delete.
 *     parameters:
 *       - name: deploymentId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The deployment ID.
 *         example: "DEPLOY123"
 *       - name: key
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The environment variable key to delete.
 *         example: "ANTI_THEFT"
 *       - name: userid
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID that owns the deployment.
 *         example: "USER123"
 *     responses:
 *       200:
 *         description: Environment variable deleted successfully from all devices.
 *       400:
 *         description: Missing parameters.
 *       403:
 *         description: Deployment not found or not owned by this user.
 *       404:
 *         description: No devices found in the deployment.
 *       500:
 *         description: Error communicating with Notehub.
 */
router.delete('/deployments/:deploymentId/notehub-env/:key', async (req, res) => {
    const { deploymentId, key } = req.params;
    const { userid } = req.query;

    if (!deploymentId || !userid || !key) {
        return res.status(400).json({
            message: 'Parameters "deploymentId", "userid", and "key" are required.',
        });
    }

    try {
        const deployment = await Deployment.findOne({ deploymentid: deploymentId, userid });
        if (!deployment) {
            return res.status(403).json({ message: 'Deployment not found or not owned by this user.' });
        }

        const devices = await RegisteredDevice.find({ auid: { $in: deployment.devices } });
        if (devices.length === 0) {
            return res.status(404).json({ message: 'No devices found in this deployment.' });
        }

        const results = [];
        for (const device of devices) {
            if (!device.noteDevUuid) continue;

            const url = `${NOTEHUB_BASE_URL}/v1/projects/${NOTEHUB_PROJECT_UID}/devices/${device.noteDevUuid}/environment_variables/${key}`;
            try {
                const response = await axios.delete(url, {
                    headers: { Authorization: `Bearer ${NOTEHUB_API_KEY}` },
                });
                results.push({
                    auid: device.auid,
                    noteDevUuid: device.noteDevUuid,
                    key,
                    deleted: true,
                    notehubResponse: response.data || 'Deleted',
                });
            } catch (err) {
                results.push({
                    auid: device.auid,
                    noteDevUuid: device.noteDevUuid,
                    key,
                    deleted: false,
                    error: err.response?.data || err.message,
                });
            }
        }

        res.status(200).json({
            message: `Environment variable "${key}" processed for all devices.`,
            results,
        });
    } catch (error) {
        console.error('❌ Error deleting Notehub env:', error.message);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});

module.exports = router;
