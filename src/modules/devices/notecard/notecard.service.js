const axios = require('axios');
const RegisteredDevice = require('../../../models/devices/registerDevice');
const Deployment = require('../../../models/deployment/deploymentModel');
const SensorModel = require('../../../models/devices/deviceModels');

const NOTEHUB_BASE_URL = process.env.NOTEHUB_BASE_URL || 'https://api.notefile.net';
const NOTEHUB_API_KEY = process.env.NOTEHUB_API_KEY;
const NOTEHUB_PROJECT_UID = process.env.NOTEHUB_PROJECT_UID;
const AQUA_PROJECT_UID = process.env.AQUA_PROJECT_UID;

class NotecardService {
    _resolveProjectUid(model) {
        if (!model) return NOTEHUB_PROJECT_UID;
        const base = model.toLowerCase().trim();

        const TERRA_PROJECT_UID = process.env.TERRA_PROJECT_UID;
        const GAS_PROOJECT_UID = process.env.GAS_PROOJECT_UID;
        const ENV_PROJECT_UID = process.env.ENV_PROJECT_UID;

        if (base.includes('aqua')) return AQUA_PROJECT_UID || NOTEHUB_PROJECT_UID;
        if (base.includes('terra')) return TERRA_PROJECT_UID || NOTEHUB_PROJECT_UID;
        if (base.includes('gas')) return GAS_PROOJECT_UID || NOTEHUB_PROJECT_UID;
        if (base.includes('env')) return ENV_PROJECT_UID || NOTEHUB_PROJECT_UID;

        return NOTEHUB_PROJECT_UID;
    }

    _buildNotehubUrl(projectUid, devUuid) {
        return `${NOTEHUB_BASE_URL}/v1/projects/${projectUid}/devices/${devUuid}/environment_variables`;
    }

    async validateDeviceInOrg(auid, userid, orgId) {
        const device = await RegisteredDevice.findOne({ auid });
        if (!device) throw new Error('Device not found');

        // Check ownership or collaborator status
        const isOwner = device.userid === userid || device.ownerUserId === userid;
        const isCollaborator = device.collaborators && device.collaborators.find(c => c.userid === userid);

        if (!isOwner && !isCollaborator) {
            throw new Error('Device not found or access denied');
        }

        if (device.organizationId && device.organizationId !== orgId) {
            throw new Error('Device does not belong to this organization');
        }
        return device;
    }

    async updateDeviceEnv(auid, userid, orgId, envVars) {
        const device = await this.validateDeviceInOrg(auid, userid, orgId);

        if (!device.noteDevUuid) throw new Error('Device missing associated Notehub UUID');

        const projectUid = this._resolveProjectUid(device.model);
        if (!projectUid) throw new Error(`No Notehub project UID configured for model ${device.model}`);

        const url = this._buildNotehubUrl(projectUid, device.noteDevUuid);
        const response = await axios.put(url, { environment_variables: envVars }, {
            headers: { 'Content-Type': 'application/json', 'X-Session-Token': NOTEHUB_API_KEY },
            timeout: 10000
        });

        // PLATFORM SYNC: Update database alert threshold if sync interval changed
        if (envVars.NOTE_OUT_MIN) {
            const newInterval = parseInt(envVars.NOTE_OUT_MIN);
            if (!isNaN(newInterval)) {
                // Set threshold to interval + buffer (e.g., 10 mins or 20% whichever is more)
                const buffer = Math.max(10, Math.ceil(newInterval * 0.2));
                device.notificationPreferences = {
                    ...device.notificationPreferences,
                    alertThresholdMinutes: newInterval + buffer
                };
                await device.save();
                console.log(`[NotecardSync] Updated alert threshold for ${auid} to ${newInterval + buffer} mins`);
            }
        }

        return {
            noteDevUuid: device.noteDevUuid,
            projectUid,
            updated: envVars,
            notehubResponse: response.data
        };
    }

    async getDeviceEnv(auid, userid, orgId) {
        const device = await this.validateDeviceInOrg(auid, userid, orgId);
        if (!device.noteDevUuid) throw new Error('Device missing associated Notehub UUID');

        const projectUid = this._resolveProjectUid(device.model);
        if (!projectUid) throw new Error(`No Notehub project UID configured for model ${device.model}`);

        const url = this._buildNotehubUrl(projectUid, device.noteDevUuid);
        const response = await axios.get(url, {
            headers: { 'X-Session-Token': NOTEHUB_API_KEY },
            timeout: 10000
        });

        return {
            noteDevUuid: device.noteDevUuid,
            projectUid,
            data: response.data
        };
    }

    async deleteDeviceEnv(auid, key, userid, orgId) {
        const device = await this.validateDeviceInOrg(auid, userid, orgId);
        if (!device.noteDevUuid) throw new Error('Device missing associated Notehub UUID');

        const projectUid = this._resolveProjectUid(device.model);
        if (!projectUid) throw new Error(`No Notehub project UID configured for model ${device.model}`);

        const url = `${this._buildNotehubUrl(projectUid, device.noteDevUuid)}/${key}`;
        const response = await axios.delete(url, {
            headers: { 'X-Session-Token': NOTEHUB_API_KEY },
            timeout: 10000
        });

        return {
            noteDevUuid: device.noteDevUuid,
            projectUid,
            notehubResponse: response.data
        };
    }

    // --- Deployment Logic ---

    async updateDeploymentEnv(deploymentId, userid, orgId, model, envVars) {
        const deployment = await Deployment.findOne({ deploymentid: deploymentId, userid });
        if (!deployment) throw new Error('Deployment not found or not owned');
        if (deployment.organizationId && deployment.organizationId !== orgId) throw new Error('Deployment not in organization');

        const cleanModel = model.trim().toLowerCase();
        const devices = await RegisteredDevice.find({
            auid: { $in: deployment.devices },
            model: cleanModel // Exact match? Original used `cleanModel` query
        });

        if (!devices.length) throw new Error(`No devices of model "${cleanModel}" in deployment`);

        const results = [];
        for (const device of devices) {
            const projectUid = this._resolveProjectUid(device.model);
            if (!projectUid || !device.noteDevUuid) {
                results.push({ auid: device.auid, status: 'skipped', reason: 'Missing Config' });
                continue;
            }
            try {
                const url = this._buildNotehubUrl(projectUid, device.noteDevUuid);
                const response = await axios.put(url, { environment_variables: envVars }, {
                    headers: { 'Content-Type': 'application/json', 'X-Session-Token': NOTEHUB_API_KEY }
                });
                results.push({ auid: device.auid, status: 'success', notehubResponse: response.data });
            } catch (err) {
                results.push({ auid: device.auid, status: 'error', error: err.message });
            }
        }
        return { deploymentId, model: cleanModel, results };
    }

    async getDeploymentModels(deploymentId, userid, orgId) {
        const deployment = await Deployment.findOne({ deploymentid: deploymentId, userid });
        if (!deployment) throw new Error('Deployment not found');
        if (deployment.organizationId !== orgId) throw new Error('Deployment not in organization');

        const devices = await RegisteredDevice.find({ auid: { $in: deployment.devices } }).select('model');
        const models = new Set(devices.map(d => d.model.toLowerCase()));
        return Array.from(models);
    }
}

module.exports = new NotecardService();
