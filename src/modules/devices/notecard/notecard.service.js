const axios = require('axios');
const RegisteredDevice = require('../../../models/devices/registerDevice');
const Deployment = require('../../../models/deployment/deploymentModel');
const { checkDeviceAccessCompatibility } = require('../../../middleware/devices/checkDeviceAccessCompatibility');
const logger = require('../../../utils/logger');

// ---------------------------------------------------------------------------
// NOTEHUB CONFIG
// ---------------------------------------------------------------------------
const NOTEHUB_BASE_URL = process.env.NOTEHUB_BASE_URL || 'https://api.notefile.net';
const NOTEHUB_API_KEY  = process.env.NOTEHUB_API_KEY;

/**
 * Per-model Notehub Project UIDs.
 *
 * Rules agreed with the team:
 *  - gas & gas-solo share the same Notehub project (NOTEHUB_PROJECT_UID).
 *  - flow uses FLOW_PROJECT_UID if set, otherwise falls back to NOTEHUB_PROJECT_UID.
 *  - aqua uses AQUA_PROJECT_UID.
 *  - env / terra / any other model uses NOTEHUB_PROJECT_UID.
 *
 * Add a new env var + entry here whenever a new model gets its own project.
 */
const PROJECT_UID_MAP = {
    env:        process.env.ENV_PROJECT_UID      || process.env.NOTEHUB_PROJECT_UID,
    terra:      process.env.TERRA_PROJECT_UID    || process.env.NOTEHUB_PROJECT_UID,
    gas:        process.env.GAS_PROJECT_UID      || process.env.NOTEHUB_PROJECT_UID,
    'gas-solo': process.env.GAS_PROJECT_UID      || process.env.NOTEHUB_PROJECT_UID, // gas and gas-solo share same project
    aqua:       process.env.AQUA_PROJECT_UID     || process.env.NOTEHUB_PROJECT_UID,
    flow:       process.env.FLOW_PROJECT_UID     || process.env.NOTEHUB_PROJECT_UID,
};

// ---------------------------------------------------------------------------
// INTERNAL HELPERS
// ---------------------------------------------------------------------------

/**
 * Resolve the Notehub Project UID for a given device model.
 * Falls back to NOTEHUB_PROJECT_UID for any model not explicitly mapped.
 */
function _resolveProjectUid(model) {
    if (!model) return process.env.NOTEHUB_PROJECT_UID || null;
    const base = model.toLowerCase().trim();
    return PROJECT_UID_MAP[base] || process.env.NOTEHUB_PROJECT_UID || null;
}

/** Build the Notehub environment-variables endpoint URL for a device. */
function _buildEnvUrl(projectUid, devUuid) {
    return `${NOTEHUB_BASE_URL}/v1/projects/${projectUid}/devices/${devUuid}/environment_variables`;
}

function _deriveSyncWindows(frequency, batch) {
    const frequencyMinutes = Number(frequency || 30);
    const batchCount = Number(batch || 2);
    const outboundMinutes = frequencyMinutes * batchCount;
    return {
        outboundMinutes,
        inboundMinutes: outboundMinutes + 5,
    };
}

/** Standard Notehub request headers. */
function _headers() {
    return {
        'Content-Type': 'application/json',
        'X-Session-Token': NOTEHUB_API_KEY
    };
}

/**
 * Validate that the requesting user has access to the device.
 * Uses checkDeviceAccessCompatibility (owner OR collaborator OR org member),
 * which is consistent with the rest of the platform.
 *
 * @param {string} auid
 * @param {object} req  - Express request (must have req.user)
 * @param {string} requiredPermission - e.g. 'edit', 'view'
 * @returns {object} device document
 */
async function _validateAccess(auid, req, requiredPermission = 'edit') {
    const device = await RegisteredDevice.findOne({ auid });
    if (!device) throw Object.assign(new Error('Device not found'), { status: 404 });

    const allowed = await checkDeviceAccessCompatibility(req, device, requiredPermission);
    if (!allowed) throw Object.assign(new Error('Forbidden: insufficient permissions'), { status: 403 });

    return device;
}

/**
 * Push environment variables to a single device on Notehub.
 * Silently skips devices that have no noteDevUuid (not Notecard-based).
 *
 * @param {object} device  - registered device document
 * @param {object} envVars - key→value map to push
 * @returns {{ skipped: boolean, reason?: string, notehubResponse?: object }}
 */
async function _pushEnvToDevice(device, envVars) {
    if (!device.noteDevUuid) {
        logger.debug(`[Notecard] Device ${device.auid} has no noteDevUuid — skipping env push`);
        return { skipped: true, reason: 'Device is not Notecard-enabled (no noteDevUuid)' };
    }

    const projectUid = _resolveProjectUid(device.model);
    if (!projectUid) {
        logger.warn(`[Notecard] No project UID configured for model '${device.model}'`);
        return { skipped: true, reason: `No Notehub project UID configured for model '${device.model}'` };
    }

    const url = _buildEnvUrl(projectUid, device.noteDevUuid);
    const environmentVariables = Object.fromEntries(
        Object.entries(envVars).map(([key, value]) => [key, String(value)])
    );
    const response = await axios.put(url, { environment_variables: environmentVariables }, {
        headers: _headers(),
        timeout: 10000
    });

    return { skipped: false, noteDevUuid: device.noteDevUuid, projectUid, notehubResponse: response.data };
}

// ---------------------------------------------------------------------------
// SERVICE CLASS
// ---------------------------------------------------------------------------

class NotecardService {

    // ── DEVICE ENV ──────────────────────────────────────────────────────────

    /**
     * Push arbitrary environment variables to a specific device.
     * Used by the API endpoint AND internally (state/frequency sync).
     */
    async updateDeviceEnv(auid, req, envVars) {
        const device = await _validateAccess(auid, req, 'edit');

        // 1. Normalize all keys to uppercase
        const normalizedEnvVars = {};
        for (const [key, value] of Object.entries(envVars)) {
            normalizedEnvVars[key.toUpperCase().trim()] = value;
        }

        // 2. Identify and sync specific variables back to MongoDB
        let docModified = false;

        if (normalizedEnvVars.hasOwnProperty('CC_FREQUENCY')) {
            const freqVal = parseInt(normalizedEnvVars.CC_FREQUENCY, 10);
            if (!isNaN(freqVal) && freqVal > 0) {
                device.frequency = freqVal;
                docModified = true;
            }
        }

        if (normalizedEnvVars.hasOwnProperty('CC_BATCH')) {
            const batchVal = parseInt(normalizedEnvVars.CC_BATCH, 10);
            if (!isNaN(batchVal) && batchVal > 0) {
                device.batch = batchVal;
                docModified = true;
            }
        }

        if (normalizedEnvVars.hasOwnProperty('CC_STATE')) {
            const stateVal = String(normalizedEnvVars.CC_STATE).toLowerCase().trim();
            if (['active', 'inactive', 'disabled'].includes(stateVal)) {
                device.state = stateVal;
                device.stateChangedAt = new Date();
                device.stateChangedBy = req.user ? req.user.userid : 'api';
                docModified = true;
            }
        }

        if (docModified) {
            await device.save();
            const CacheService = require('../../../modules/common/cache.service');
            await CacheService.invalidate(`device:${auid}:meta`);
        }

        if ((normalizedEnvVars.CC_FREQUENCY || normalizedEnvVars.CC_BATCH) &&
            (!normalizedEnvVars.CC_INBOUND || !normalizedEnvVars.CC_OUTBOUND)) {
            const { outboundMinutes, inboundMinutes } = _deriveSyncWindows(device.frequency, device.batch);
            if (!normalizedEnvVars.CC_INBOUND) normalizedEnvVars.CC_INBOUND = inboundMinutes;
            if (!normalizedEnvVars.CC_OUTBOUND) normalizedEnvVars.CC_OUTBOUND = outboundMinutes;
        }

        // 3. Push env variables to Notehub at device level.
        // Device-level env vars intentionally override Fleet and Project env vars.
        const result = await _pushEnvToDevice(device, normalizedEnvVars);

        return { auid, ...result, updated: normalizedEnvVars };
    }

    async getDeviceEnv(auid, req) {
        const device = await _validateAccess(auid, req, 'view');

        if (!device.noteDevUuid) {
            return { auid, skipped: true, reason: 'Device is not Notecard-enabled (no noteDevUuid)' };
        }

        const projectUid = _resolveProjectUid(device.model);
        if (!projectUid) throw new Error(`No Notehub project UID for model '${device.model}'`);

        const url = _buildEnvUrl(projectUid, device.noteDevUuid);
        const response = await axios.get(url, { headers: _headers(), timeout: 10000 });

        return { auid, noteDevUuid: device.noteDevUuid, projectUid, data: response.data };
    }

    async deleteDeviceEnv(auid, key, req) {
        const device = await _validateAccess(auid, req, 'edit');

        if (!device.noteDevUuid) {
            return { auid, skipped: true, reason: 'Device is not Notecard-enabled (no noteDevUuid)' };
        }

        const projectUid = _resolveProjectUid(device.model);
        if (!projectUid) throw new Error(`No Notehub project UID for model '${device.model}'`);

        const url = `${_buildEnvUrl(projectUid, device.noteDevUuid)}/${key}`;
        const response = await axios.delete(url, { headers: _headers(), timeout: 10000 });

        return { auid, noteDevUuid: device.noteDevUuid, projectUid, deletedKey: key, notehubResponse: response.data };
    }

    // ── DEPLOYMENT ENV ─────────────────────────    
    /**
     * Bulk update env vars for all devices of a given model in a deployment.
     * Maps to a native Notehub Fleet and writes to it directly, ensuring inheritance.
     */
    async updateDeploymentEnv(deploymentId, model, envVars, req) {
        const deployment = await Deployment.findOne({ deploymentid: deploymentId });
        if (!deployment) throw Object.assign(new Error('Deployment not found'), { status: 404 });

        // Org-level access is checked by checkOrgAccess middleware on the route.
        // We still guard that the deployment belongs to the user's org.
        const orgId = req.user.currentOrganizationId || req.headers['x-org-id'];
        if (deployment.organizationId && deployment.organizationId !== orgId) {
            throw Object.assign(new Error('Deployment does not belong to this organization'), { status: 403 });
        }

        const cleanModel = model.trim().toLowerCase();
        const projectUid = _resolveProjectUid(cleanModel);
        if (!projectUid) throw new Error(`No Notehub project UID configured for model '${cleanModel}'`);

        // 1. Get or Create Notehub Fleet dynamically for this model in the deployment
        let fleetUid = deployment.notehubFleets ? deployment.notehubFleets.get(cleanModel) : null;
        if (!fleetUid) {
            const label = `${deployment.name} - ${cleanModel}`;
            fleetUid = await this.createFleet(projectUid, label);
            
            if (!deployment.notehubFleets) {
                deployment.notehubFleets = new Map();
            }
            deployment.notehubFleets.set(cleanModel, fleetUid);
            await deployment.save();
        }

        // 2. Put environment variables at the Fleet level in Notehub
        const notehubResponse = await this.updateFleetEnv(projectUid, fleetUid, envVars);

        return {
            deploymentId,
            model: cleanModel,
            fleetUid,
            notehubResponse,
            deviceOverridesPreserved: true
        };
    }

    async getDeploymentModels(deploymentId, req) {
        const deployment = await Deployment.findOne({ deploymentid: deploymentId });
        if (!deployment) throw Object.assign(new Error('Deployment not found'), { status: 404 });

        const orgId = req.user.currentOrganizationId || req.headers['x-org-id'];
        if (deployment.organizationId && deployment.organizationId !== orgId) {
            throw Object.assign(new Error('Deployment does not belong to this organization'), { status: 403 });
        }

        const devices = await RegisteredDevice.find(
            { auid: { $in: deployment.devices } },
            { model: 1, noteDevUuid: 1 }
        );

        const models = new Set(devices.map(d => d.model.toLowerCase()));
        const notecardCount = devices.filter(d => !!d.noteDevUuid).length;

        return {
            deploymentId,
            models: Array.from(models),
            totalDevices: devices.length,
            notecardEnabledDevices: notecardCount,
            nonNotecardDevices: devices.length - notecardCount
        };
    }

    // ── ORG ENV ─────────────────────────────────────────────────────────────

    /**
     * Bulk push env vars to ALL Notecard devices in an organization.
     * Optionally filter by model. Skips non-Notecard devices gracefully.
     */
    async updateOrganizationEnv(orgId, envVars, req, model = null) {
        const query = { organizationId: orgId, deletedAt: null };
        if (model) query.model = { $regex: new RegExp(`^${model.trim()}$`, 'i') };

        const devices = await RegisteredDevice.find(query, { auid: 1, model: 1, noteDevUuid: 1, nickname: 1 });

        if (!devices.length) {
            return { orgId, model: model || 'all', totalDevices: 0, results: [] };
        }

        const results = await Promise.all(devices.map(async (device) => {
            try {
                const result = await _pushEnvToDevice(device, envVars);
                return { auid: device.auid, nickname: device.nickname, status: result.skipped ? 'skipped' : 'success', ...result };
            } catch (err) {
                logger.error(`[Notecard] Org env push failed for ${device.auid}: ${err.message}`);
                return { auid: device.auid, nickname: device.nickname, status: 'error', error: err.message };
            }
        }));

        const summary = results.reduce((acc, r) => {
            acc[r.status] = (acc[r.status] || 0) + 1;
            return acc;
        }, {});

        return { orgId, model: model || 'all', totalDevices: devices.length, summary, results };
    }

    // ── FLEET MANAGEMENT HELPERS ──────────────────────────────────────────────

    /**
     * Create a new Fleet in Notehub.
     */
    async createFleet(projectUid, label) {
        try {
            const url = `${NOTEHUB_BASE_URL}/v1/projects/${projectUid}/fleets`;
            const response = await axios.post(url, { label }, {
                headers: _headers(),
                timeout: 10000
            });
            logger.info(`[Notecard] Created Fleet '${label}' in Notehub project ${projectUid}: ${response.data.uid}`);
            return response.data.uid; // e.g. fleet:xxxx
        } catch (err) {
            logger.error(`[Notecard] Failed to create Fleet '${label}': ${err.message}`);
            throw err;
        }
    }

    /**
     * Delete a Fleet from Notehub.
     */
    async deleteFleet(projectUid, fleetUid) {
        try {
            const url = `${NOTEHUB_BASE_URL}/v1/projects/${projectUid}/fleets/${fleetUid}`;
            await axios.delete(url, {
                headers: _headers(),
                timeout: 10000
            });
            logger.info(`[Notecard] Deleted Fleet ${fleetUid} from Notehub project ${projectUid}`);
            return { success: true };
        } catch (err) {
            logger.warn(`[Notecard] Failed to delete Fleet ${fleetUid}: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    /**
     * Add a device to a Notehub Fleet.
     */
    async addDeviceToFleet(projectUid, fleetUid, noteDevUuid) {
        try {
            const url = `${NOTEHUB_BASE_URL}/v1/projects/${projectUid}/fleets/${fleetUid}`;
            await axios.put(url, { addDevices: [noteDevUuid] }, {
                headers: _headers(),
                timeout: 10000
            });
            logger.info(`[Notecard] Added device ${noteDevUuid} to Fleet ${fleetUid}`);
            return { success: true };
        } catch (err) {
            logger.error(`[Notecard] Failed to add device ${noteDevUuid} to Fleet ${fleetUid}: ${err.message}`);
            throw err;
        }
    }

    /**
     * Remove a device from a Notehub Fleet.
     */
    async removeDeviceFromFleet(projectUid, fleetUid, noteDevUuid) {
        try {
            const url = `${NOTEHUB_BASE_URL}/v1/projects/${projectUid}/fleets/${fleetUid}`;
            await axios.put(url, { removeDevices: [noteDevUuid] }, {
                headers: _headers(),
                timeout: 10000
            });
            logger.info(`[Notecard] Removed device ${noteDevUuid} from Fleet ${fleetUid}`);
            return { success: true };
        } catch (err) {
            logger.warn(`[Notecard] Failed to remove device ${noteDevUuid} from Fleet ${fleetUid}: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    /**
     * Delete specific device-level environment variables on Notehub.
     */
    async deleteDeviceEnvKeys(projectUid, noteDevUuid, keys) {
        const results = await Promise.all(keys.map(async (key) => {
            try {
                const url = `${NOTEHUB_BASE_URL}/v1/projects/${projectUid}/devices/${noteDevUuid}/environment_variables/${key}`;
                await axios.delete(url, {
                    headers: _headers(),
                    timeout: 10000
                });
                return { key, status: 'deleted' };
            } catch (err) {
                // If it wasn't set, Notehub may throw 404, which is expected and fine
                return { key, status: 'skipped', reason: err.message };
            }
        }));
        logger.debug(`[Notecard] Deleted device-level overrides for ${noteDevUuid}: ${JSON.stringify(results)}`);
        return results;
    }

    /**
     * Put environment variables on a Notehub Fleet.
     */
    async updateFleetEnv(projectUid, fleetUid, envVars) {
        try {
            const url = `${NOTEHUB_BASE_URL}/v1/projects/${projectUid}/fleets/${fleetUid}/environment_variables`;
            const response = await axios.put(url, { environment_variables: envVars }, {
                headers: _headers(),
                timeout: 10000
            });
            logger.info(`[Notecard] Updated environment variables on Fleet ${fleetUid}`);
            return response.data;
        } catch (err) {
            logger.error(`[Notecard] Failed to update environment variables on Fleet ${fleetUid}: ${err.message}`);
            throw err;
        }
    }

    /**
     * Resolve the Notehub Project UID for a given device model.
     * Falls back to NOTEHUB_PROJECT_UID for any model not explicitly mapped.
     */
    resolveProjectUid(model) {
        return _resolveProjectUid(model);
    }

    // ── INTERNAL SYNC (called by registry.service.js) ────────────────────────

    /**
     * Push device operational state to Notecard via Notehub env var.
     * CC_STATE = 'active' | 'inactive' | 'disabled'
     * Called automatically by setDeviceState() — no auth check needed (internal).
     */
    async syncStateToNotecard(device) {
        try {
            const result = await _pushEnvToDevice(device, { 
                CC_STATE: device.state,
                CC_NET_MODE: device.netMode || 'cellular'
            });
            if (!result.skipped) {
                logger.info(`[Notecard] Synced state '${device.state}' and netMode '${device.netMode || 'cellular'}' to Notehub for device ${device.auid}`);
            }
            return result;
        } catch (err) {
            // Non-fatal: log and continue. MongoDB + Redis are source of truth.
            logger.warn(`[Notecard] Failed to sync state for ${device.auid}: ${err.message}`);
            return { skipped: true, reason: err.message };
        }
    }

    /**
     * Push frequency & batch config to Notecard via Notehub env vars.
     * CC_FREQUENCY = minutes (integer)
     * CC_BATCH     = count (integer)
     * Called automatically by updateDevice() — no auth check needed (internal).
     */
    async syncConfigToNotecard(device) {
        try {
            // CC_INBOUND / CC_OUTBOUND = full batch cycle time (how often Notecard syncs with Notehub)
            // frequency (min) × batch (count) = total minutes per batch window
            const { outboundMinutes, inboundMinutes } = _deriveSyncWindows(device.frequency, device.batch);
            const envVars = {
                CC_FREQUENCY: device.frequency,
                CC_BATCH:     device.batch,
                CC_NET_MODE:  device.netMode || 'cellular',
                CC_INBOUND:   inboundMinutes,
                CC_OUTBOUND:  outboundMinutes
            };
            const result = await _pushEnvToDevice(device, envVars);
            if (!result.skipped) {
                logger.info(
                    `[Notecard] Synced config to Notehub for ${device.auid} — ` +
                    `freq=${device.frequency}min, batch=${device.batch}, ` +
                    `outbound=${outboundMinutes}min, inbound=${inboundMinutes}min`
                );
            }
            return result;
        } catch (err) {
            logger.warn(`[Notecard] Failed to sync config for ${device.auid}: ${err.message}`);
            return { skipped: true, reason: err.message };
        }
    }

    /**
     * Push initial configuration and state defaults to Notehub environment variables.
     * Called on the first telemetry/ping message from a device.
     */
    async pushInitialDefaultsToNotehub(device) {
        if (device.deployment) {
            logger.debug(`[Notecard] Device ${device.auid} is in a deployment — skipping device-level default sync to preserve Fleet inheritance.`);
            return { skipped: true, reason: 'Device is in a deployment (inherits from Fleet)' };
        }
        try {
            const { outboundMinutes, inboundMinutes } = _deriveSyncWindows(device.frequency, device.batch);
            const envVars = {
                CC_STATE: device.state || 'active',
                CC_FREQUENCY: String(device.frequency || 30),
                CC_BATCH: String(device.batch || 2),
                CC_BUZZER_EN: '1',
                CC_INBOUND: String(inboundMinutes),
                CC_OUTBOUND: String(outboundMinutes),
                CC_NET_MODE: device.netMode || 'cellular'
            };
            const result = await _pushEnvToDevice(device, envVars);
            if (!result.skipped) {
                logger.info(`[Notecard] Synced initial defaults to Notehub for ${device.auid}`);
            }
            return result;
        } catch (err) {
            logger.error(`[Notecard] Failed to push initial defaults for ${device.auid}: ${err.message}`);
            throw err;
        }
    }
}

module.exports = new NotecardService();

// Export internal helper for registry.service.js to use directly
module.exports._pushEnvToDevice = _pushEnvToDevice;
