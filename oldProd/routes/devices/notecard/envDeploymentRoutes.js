// routes/api/devices/deploymentNotehubEnvRoutes.js

const express = require('express');
const axios = require('axios');

const Deployment = require('../../../model/deployment/deploymentModel');
const RegisteredDevice = require('../../../model/devices/registerDevice');
const SensorModel = require('../../../model/devices/deviceModels');
const Organization = require('../../../model/organization/organizationModel');

const dotenv = require('dotenv');
const path = require('path');

// Middleware imports
const authenticateToken = require('../../../middleware/bearermiddleware');
const checkOrgAccess = require('../../../middleware/organization/checkOrgAccess');

let envFile;
envFile = process.env.NODE_ENV === 'development' ? '.env.development' : '.env';

dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });

const router = express.Router();

// ----------------------------------------------------------------
// NOTEHUB CONFIG
// ----------------------------------------------------------------
const NOTEHUB_BASE_URL = process.env.NOTEHUB_BASE_URL || 'https://api.notefile.net';
const NOTEHUB_PROJECT_UID = process.env.NOTEHUB_PROJECT_UID; // env, terra, gas
const AQUA_PROJECT_UID = process.env.AQUA_PROJECT_UID;        // aqua
const NOTEHUB_API_KEY = process.env.NOTEHUB_API_KEY;

// HELPERS ---------------------------------------------------------

/** Resolve Notehub Project UID based on model */
function resolveProjectUid(model) {
    if (!model) return null;

    const base = model.toLowerCase().trim(); // env, aqua, terra, gas

    if (base === 'aqua') return AQUA_PROJECT_UID;
    if (['env', 'terra', 'gas'].includes(base)) return NOTEHUB_PROJECT_UID;

    return null;
}

/** Build Notehub API URL */
function buildNotehubUrl(projectUid, devUuid) {
    return `${NOTEHUB_BASE_URL}/v1/projects/${projectUid}/devices/${devUuid}/environment_variables`;
}

/**
 * Validate that deployment belongs to the organization
 * Returns { valid: boolean, message?: string }
 */
async function validateDeploymentInOrg(deploymentId, orgId) {
    try {
        const deployment = await Deployment.findOne({ deploymentid: deploymentId });
        if (!deployment) {
            return { valid: false, message: 'Deployment not found' };
        }

        // Check if deployment belongs to the organization
        if (deployment.organizationId && deployment.organizationId !== orgId) {
            return { valid: false, message: 'Deployment does not belong to this organization' };
        }

        return { valid: true, deployment };
    } catch (err) {
        return { valid: false, message: 'Error validating deployment' };
    }
}

//
// ──────────────────────────────────────────────────────────────────────────
//   SWAGGER: UPDATE ENV VARS FOR DEVICES BY MODEL IN DEPLOYMENT
// ──────────────────────────────────────────────────────────────────────────
//

/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/update-env:
 *   put:
 *     tags:
 *       - Device Config
 *     summary: Update Notehub environment variables for devices of a selected model inside a deployment
 *     description: |
 *       Allows a user to update Notecard environment variables across all devices within a deployment  
 *       **that match a specific device model** (env, aqua, terra, gas).
 *       <br><br>
 *       The correct Notehub project UID is automatically selected based on the model:
 *         - **env, terra, gas → NOTEHUB_PROJECT_UID**  
 *         - **aqua → AQUA_PROJECT_UID**
 *     parameters:
 *       - name: deploymentId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Deployment ID
 *         example: "DEPLOY00123"
 *       - name: userid
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID that owns the deployment
 *         example: "USER12345"
 *       - name: model
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Device model to target (env, aqua, terra, gas)
 *         example: "env"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               envVars:
 *                 type: object
 *                 description: Environment variables to set on Notehub
 *                 example:
 *                   anti_theft_enabled: "true"
 *                   sync_interval_min: "15"
 *                   note_in_min: "5"
 *                   temperature_offset: "-1.2"
 *     responses:
 *       200:
 *         description: Environment variables updated successfully
 *       400:
 *         description: Missing or invalid parameters
 *       403:
 *         description: Deployment not owned by user
 *       404:
 *         description: No devices of that model inside deployment
 *       500:
 *         description: Server or Notehub communication error
 */
router.put(
    '/deployments/:deploymentId/update-env',
    authenticateToken,
    checkOrgAccess('org.notecard.edit'),
    async (req, res) => {
        const { deploymentId } = req.params;
        const { userid, model } = req.query;
        const envVars = req.body.envVars || req.body;
        const orgId = req.user.organizationId;

        if (!userid || !deploymentId || !model) {
            return res.status(400).json({
                message: 'Missing required: userid, deploymentId, model'
            });
        }

        if (!envVars || typeof envVars !== 'object' || Object.keys(envVars).length === 0) {
            return res.status(400).json({
                message: 'envVars must be a non-empty object'
            });
        }

        try {
            // Validate deployment belongs to organization
            const validation = await validateDeploymentInOrg(deploymentId, orgId);
            if (!validation.valid) {
                return res.status(403).json({ error: validation.message });
            }

            const cleanModel = model.trim().toLowerCase();
            const validModel = await SensorModel.findOne({ model: cleanModel });

            if (!validModel) {
                return res.status(404).json({
                    message: `Model "${cleanModel}" does not exist`
                });
            }

            const deployment = await Deployment.findOne({ deploymentid: deploymentId, userid });
            if (!deployment) {
                return res.status(403).json({
                    message: 'Deployment not found or not owned by user'
                });
            }

        const devices = [];
        for (const auid of deployment.devices) {
            const device = await RegisteredDevice.findOne({ auid, model: cleanModel });
            if (device) devices.push(device);
        }

        if (devices.length === 0) {
            return res.status(404).json({
                message: `No devices of model "${cleanModel}" in deployment`
            });
        }

        const results = [];

        for (const device of devices) {
            const projectUid = resolveProjectUid(device.model);

            if (!projectUid) {
                results.push({
                    auid: device.auid,
                    status: 'skipped',
                    reason: `No Notehub project configured for model ${device.model}`
                });
                continue;
            }

            if (!device.noteDevUuid) {
                results.push({
                    auid: device.auid,
                    status: 'skipped',
                    reason: 'Missing noteDevUuid'
                });
                continue;
            }

            const url = buildNotehubUrl(projectUid, device.noteDevUuid);

            try {
                const response = await axios.put(
                    url,
                    { environment_variables: envVars },
                    {
                        headers: {
                            "X-Session-Token": NOTEHUB_API_KEY,
                            "Content-Type": "application/json"
                        }
                    }
                );

                results.push({
                    auid: device.auid,
                    projectUid,
                    noteDevUuid: device.noteDevUuid,
                    status: "success",
                    updated: envVars,
                    notehubResponse: response.data
                });

            } catch (err) {
                results.push({
                    auid: device.auid,
                    projectUid,
                    noteDevUuid: device.noteDevUuid,
                    status: "error",
                    error: err.response?.data || err.message
                });
            }
        }

        res.status(200).json({
            message: `Processed ${results.length} devices`,
            deploymentId,
            model: cleanModel,
            results
        });

    } catch (err) {
        console.error("Error updating Notehub:", err);
        res.status(500).json({ message: "Internal server error", error: err.message });
    }
});

//
// ──────────────────────────────────────────────────────────────────────────
//   SWAGGER: GET MODELS IN DEPLOYMENT
// ──────────────────────────────────────────────────────────────────────────
//

/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/models:
 *   get:
 *     tags:
 *       - Device Config
 *     summary: Get all unique device models inside a deployment
 *     description: |
 *       Lists all unique device models (env, aqua, terra, gas) that are currently part of a deployment.
 *     parameters:
 *       - name: deploymentId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         example: "DEPLOY12345"
 *       - name: userid
 *         in: query
 *         required: true
 *         schema: { type: string }
 *         example: "USER123"
 *     responses:
 *       200:
 *         description: Unique list of models inside deployment
 *       400:
 *         description: Missing parameters
 *       403:
 *         description: Deployment not owned by user
 *       404:
 *         description: No devices found in deployment
 *       500:
 *         description: Server error
 */
router.get(
    '/deployments/:deploymentId/models',
    authenticateToken,
    checkOrgAccess('org.notecard.view'),
    async (req, res) => {
        const { deploymentId } = req.params;
        const { userid } = req.query;
        const orgId = req.user.organizationId;

        if (!userid) {
            return res.status(400).json({ message: 'userid is required' });
        }

        try {
            // Validate deployment belongs to organization
            const validation = await validateDeploymentInOrg(deploymentId, orgId);
            if (!validation.valid) {
                return res.status(403).json({ error: validation.message });
            }

            const deployment = await Deployment.findOne({ deploymentid: deploymentId, userid });

            if (!deployment) {
                return res.status(403).json({ message: 'Deployment not found or not owned by user' });
            }

        const models = new Set();

        for (const auid of deployment.devices) {
            const device = await RegisteredDevice.findOne({ auid }).select("model");
            if (device) models.add(device.model.toLowerCase());
        }

        res.status(200).json({
            deploymentId,
            totalModels: models.size,
            models: Array.from(models)
        });

    } catch (err) {
        console.error("Error retrieving models:", err);
        res.status(500).json({ message: "Internal error", error: err.message });
    }
});

//
// ──────────────────────────────────────────────────────────────────────────
//   SWAGGER: GET NOTEHUB ENV FOR ALL DEVICES IN DEPLOYMENT
// ──────────────────────────────────────────────────────────────────────────
//

/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/notehub-env:
 *   get:
 *     tags:
 *       - Device Config
 *     summary: Get Notehub environment variables for all devices in a deployment
 *     description: |
 *       Retrieves all Notehub environment variables for each device inside a deployment.  
 *       Automatically selects correct Notehub project UID based on each device model.
 *     parameters:
 *       - name: deploymentId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         example: "DEPLOY001"
 *       - name: userid
 *         in: query
 *         required: true
 *         schema: { type: string }
 *         example: "USER123"
 *     responses:
 *       200:
 *         description: Environment variables returned
 *       400:
 *         description: Missing userid or deploymentId
 *       403:
 *         description: Deployment not owned by user
 *       404:
 *         description: No devices found
 *       500:
 *         description: Error fetching Notehub data
 */
router.get(
    '/deployments/:deploymentId/notehub-env',
    authenticateToken,
    checkOrgAccess('org.notecard.view'),
    async (req, res) => {
        const { deploymentId } = req.params;
        const { userid } = req.query;
        const orgId = req.user.organizationId;

        if (!userid) return res.status(400).json({ message: "userid required" });

        try {
            // Validate deployment belongs to organization
            const validation = await validateDeploymentInOrg(deploymentId, orgId);
            if (!validation.valid) {
                return res.status(403).json({ error: validation.message });
            }

            const deployment = await Deployment.findOne({ deploymentid: deploymentId, userid });
            if (!deployment) {
                return res.status(403).json({ message: "Deployment not found or not owned" });
            }

        const devices = await RegisteredDevice.find({ auid: { $in: deployment.devices } });

        const results = [];

        for (const device of devices) {
            const projectUid = resolveProjectUid(device.model);

            if (!projectUid || !device.noteDevUuid) {
                results.push({
                    auid: device.auid,
                    projectUid,
                    noteDevUuid: device.noteDevUuid,
                    environment: null,
                    reason: "Missing project or noteDevUuid"
                });
                continue;
            }

            const url = buildNotehubUrl(projectUid, device.noteDevUuid);

            try {
                const response = await axios.get(url, {
                    headers: { "X-Session-Token": NOTEHUB_API_KEY }
                });

                results.push({
                    auid: device.auid,
                    projectUid,
                    noteDevUuid: device.noteDevUuid,
                    model: device.model,
                    environment: response.data.environment_variables || {}
                });

            } catch (err) {
                results.push({
                    auid: device.auid,
                    projectUid,
                    noteDevUuid: device.noteDevUuid,
                    model: device.model,
                    error: err.response?.data || err.message
                });
            }
        }

        res.status(200).json({
            deploymentId,
            totalDevices: results.length,
            results
        });

    } catch (err) {
        console.error("Error fetching Notehub env:", err);
        res.status(500).json({ message: "Internal error", error: err.message });
    }
});

//
// ──────────────────────────────────────────────────────────────────────────
//   SWAGGER: DELETE ENV VAR ACROSS ALL DEVICES IN DEPLOYMENT
// ──────────────────────────────────────────────────────────────────────────
//

/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/notehub-env/{key}:
 *   delete:
 *     tags:
 *       - Device Config
 *     summary: Delete an environment variable from all devices in a deployment
 *     description: |
 *       Deletes the specified environment variable across all devices within the deployment.  
 *       Automatically selects correct Notehub project UID based on device model.
 *     parameters:
 *       - name: deploymentId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         example: "DEPLOY001"
 *       - name: key
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         example: "ANTI_THEFT"
 *       - name: userid
 *         in: query
 *         required: true
 *         schema: { type: string }
 *         example: "USER123"
 *     responses:
 *       200:
 *         description: Environment variable deleted from applicable devices
 *       400:
 *         description: Missing parameters
 *       403:
 *         description: Deployment not owned by user
 *       404:
 *         description: No devices found
 *       500:
 *         description: Error deleting Notehub key
 */
router.delete(
    '/deployments/:deploymentId/notehub-env/:key',
    authenticateToken,
    checkOrgAccess('org.notecard.delete'),
    async (req, res) => {
        const { deploymentId, key } = req.params;
        const { userid } = req.query;
        const orgId = req.user.organizationId;

        if (!userid || !key) {
            return res.status(400).json({ message: "userid and key required" });
        }

        try {
            // Validate deployment belongs to organization
            const validation = await validateDeploymentInOrg(deploymentId, orgId);
            if (!validation.valid) {
                return res.status(403).json({ error: validation.message });
            }

            const deployment = await Deployment.findOne({ deploymentid: deploymentId, userid });
            if (!deployment) {
                return res.status(403).json({ message: "Deployment not found or not owned" });
            }

        const devices = await RegisteredDevice.find({ auid: { $in: deployment.devices } });

        const results = [];

        for (const device of devices) {
            const projectUid = resolveProjectUid(device.model);

            if (!projectUid || !device.noteDevUuid) {
                results.push({
                    auid: device.auid,
                    projectUid,
                    noteDevUuid: device.noteDevUuid,
                    deleted: false,
                    reason: "Missing project or noteDevUuid"
                });
                continue;
            }

            const url = `${buildNotehubUrl(projectUid, device.noteDevUuid)}/${key}`;

            try {
                const response = await axios.delete(url, {
                    headers: { "X-Session-Token": NOTEHUB_API_KEY }
                });

                results.push({
                    auid: device.auid,
                    projectUid,
                    deleted: true,
                    notehubResponse: response.data || "Deleted"
                });

            } catch (err) {
                results.push({
                    auid: device.auid,
                    projectUid,
                    deleted: false,
                    error: err.response?.data || err.message
                });
            }
        }

        res.status(200).json({
            message: `ENV key "${key}" processed for devices`,
            deploymentId,
            results
        });

    } catch (err) {
        console.error("Error deleting Notehub key:", err);
        res.status(500).json({ message: "Internal error", error: err.message });
    }
});

module.exports = router;
