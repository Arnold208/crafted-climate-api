const axios = require('axios');
const addDevice = require('../../../models/devices/addDevice');
const registerNewDevice = require('../../../models/devices/registerDevice');
const SensorModel = require('../../../models/devices/deviceModels');
const User = require('../../../models/user/userModel');
const Deployment = require('../../../models/deployment/deploymentModel');
const Organization = require('../../../models/organization/organizationModel');
const Threshold = require('../../../models/threshold/threshold');
const enforceDeviceLimit = require('../../../middleware/subscriptions/enforceDeviceLimit');
const { sendEmail } = require('../../../config/mail/nodemailer');
const CacheService = require('../../../modules/common/cache.service');
const { createAuditLog } = require('../../../utils/auditLogger');
const { client: redisClient } = require('../../../config/redis/redis');
// Notecard auto-sync (non-fatal if Notehub is unreachable)
const notecardService = require('../notecard/notecard.service');
// Device event log (fire-and-forget)
const eventLog = require('../eventLog/eventLog.service');

// Telemetry Models for Fallback
const EnvTelemetry = require('../../../models/telemetry/envModel');
const AquaTelemetry = require('../../../models/telemetry/aquaModel');
const GasSoloTelemetry = require('../../../models/telemetry/gasSoloModel');

const MODEL_MAP = {
    env: EnvTelemetry,
    aqua: AquaTelemetry,
    'gas-solo': GasSoloTelemetry
};

class RegistryService {
    async registerDevice({ auid, serial, location, nickname, userid, organizationId, frequency, batch }) {
        // 1. Check Existence
        const existing = await registerNewDevice.findOne({ serial });
        if (existing) {
            throw new Error(existing.organization === organizationId
                ? "Device already registered in this organization."
                : "Device belongs to another organization.");
        }

        // 2. Enforce Limit (Organization Scope)
        await enforceDeviceLimit(userid, organizationId);

        // 3. Manufactured Check
        const manufactured = await addDevice.findOne({ serial });
        if (!manufactured) throw new Error('Device not found in manufacturing records.');

        // 3. Geocoding
        const [latitude, longitude] = location;
        let locationInfo = { latitude, longitude };
        try {
            const geoRes = await axios.get('https://atlas.microsoft.com/search/address/reverse/json', {
                params: {
                    'api-version': '1.0',
                    'subscription-key': process.env.AZURE_MAPS_SUBSCRIPTION_KEY,
                    query: `${latitude},${longitude}`,
                },
            });
            const address = geoRes?.data?.addresses?.[0]?.address || {};
            locationInfo = {
                ...locationInfo,
                country: address.country,
                region: address.countrySubdivision,
                city: address.municipality,
                postalCode: address.postalCode,
                street: address.street,
                municipality: address.municipality,
                municipalitySubdivision: address.municipalitySubdivision,
            };
        } catch (err) {
            console.warn("Geocoding failed, proceeding with coords only");
        }

        // 4. Image
        const modelEntry = await SensorModel.findOne({ model: manufactured.model.toLowerCase() });
        const imageUrl = modelEntry?.imageUrl || process.env.DEFAULT_IMAGE_URL;

        // 4.5 Resolve Plan and Initial netMode/state
        const Plan = require('../../../models/subscriptions/Plan');
        const UserSubscription = require('../../../models/subscriptions/UserSubscription');
        const subQuery = organizationId
            ? { organizationId, status: 'active' }
            : { userid, organizationId: null, status: 'active' };
        const subscription = await UserSubscription.findOne(subQuery);
        let planName = 'freemium';
        if (subscription) {
            const plan = await Plan.findOne({ planId: subscription.planId });
            if (plan) planName = plan.name.toLowerCase();
        }

        const acquisitionType = manufactured.acquisitionType || 'purchase';
        let initialNetMode = 'cellular';
        let initialDeviceState = 'active';

        if (planName === 'freemium') {
            if (acquisitionType === 'purchase') {
                initialNetMode = 'wifi';
            } else if (acquisitionType === 'maas') {
                initialDeviceState = 'disabled';
            }
        }

        // 5. Save
        const newDevice = new registerNewDevice({
            auid,
            serial,
            devid: manufactured.devid,
            mac: manufactured.mac,
            model: manufactured.model,
            type: manufactured.type,
            datapoints: manufactured.datapoints,
            userid, // Owner
            ownerUserId: userid,
            organization: organizationId,
            organizationId,
            collaborators: [{
                userid,
                role: "device-admin",
                permissions: ["update", "delete", "export", "share"],
                addedAt: new Date(),
            }],
            nickname,
            location: JSON.stringify(locationInfo),
            battery: 100,
            subscription: [],
            image: imageUrl,
            status: initialDeviceState === 'disabled' ? 'disabled' : 'offline',
            state: initialDeviceState,
            netMode: initialNetMode,
            availability: 'private',
            manufacturingId: manufactured.manufacturingId,
            frequency: frequency !== undefined ? frequency : 30,
            batch: batch !== undefined ? batch : 2,
            noteDevUuid: manufactured.noteDevUuid,
            acquisitionType: acquisitionType,
        });

        await newDevice.save();

        // 6. Link to Org
        await Organization.updateOne(
            { organizationId },
            { $addToSet: { devices: auid } }
        );

        // Update manufactured device status and auid
        await addDevice.updateOne(
            { serial },
            { $set: { status: 'REGISTERED', auid } }
        );

        // AUDIT LOG
        await createAuditLog({
            action: 'DEVICE_REGISTER',
            userid: userid,
            organizationId: organizationId,
            details: { auid, serial, model: manufactured.model },
            ipAddress: null
        });

        // 📡 Push initial config to Notecard (non-blocking, non-fatal)
        // This ensures the physical device starts with correct frequency/batch/state
        // from the first Notehub sync rather than relying on firmware defaults.
        if (manufactured.noteDevUuid) {
            notecardService.syncConfigToNotecard(newDevice).catch(() => {});
        }

        return newDevice;
    }

    async getDeviceByAuid(auid) {
        return await registerNewDevice.findOne({ auid });
    }

    async getOrganizationDevices(organizationId) {
        return await registerNewDevice.find({ organizationId });
    }

    async getUserDevices(userid) {
        const owned = await registerNewDevice.find({ userid });
        const ownedIds = new Set(owned.map(d => d.devid));

        const shared = await registerNewDevice.find({ 'collaborators.userid': userid });
        const distinctShared = shared.filter(d => !ownedIds.has(d.devid)).map(d => ({ ...d.toObject(), shared: true }));

        return [...owned.map(d => ({ ...d.toObject(), shared: false })), ...distinctShared];
    }

    async updateDevice(userid, auid, reqBody) {
        // Note: Access check logic is in Controller/Middleware typically. 
        // Service just performs the action assuming authorized.
        const device = await registerNewDevice.findOne({ auid });
        // We don't filter by USERID here strictly if we assume controller checked access. 
        // But logic requires device to exist.
        if (!device) throw new Error('Device not found.');

        const { nickname, location, frequency, batch, netMode } = reqBody;

        // ── Validate frequency / batch minimums (frequency is in MINUTES) ──────
        if (frequency !== undefined) {
            const freqNum = Number(frequency);
            if (isNaN(freqNum) || freqNum < 10) {
                throw new Error('Minimum transmission frequency is 10 minutes.');
            }
        }
        if (batch !== undefined) {
            const batchNum = Number(batch);
            if (isNaN(batchNum) || batchNum < 2) {
                throw new Error('Minimum batch size is 2 readings per batch.');
            }
        }

        // Capture before-state for CONFIG_CHANGED event log
        const configBefore = { frequency: device.frequency, batch: device.batch, netMode: device.netMode };

        // Track config changes before mutation (for Notecard sync decision)
        const freqChanged  = frequency !== undefined && frequency !== device.frequency;
        const batchChanged = batch !== undefined && batch !== device.batch;
        
        let netModeChanged = false;
        if (netMode !== undefined && netMode !== device.netMode) {
            if (!['cellular', 'wifi'].includes(netMode)) {
                throw new Error("Invalid netMode. Must be 'cellular' or 'wifi'");
            }
            if (netMode === 'cellular') {
                const Plan = require('../../../models/subscriptions/Plan');
                const UserSubscription = require('../../../models/subscriptions/UserSubscription');
                const orgId = device.organizationId;
                const subQuery = orgId 
                    ? { organizationId: orgId, status: 'active' }
                    : { userid: userid, organizationId: null, status: 'active' };
                const subscription = await UserSubscription.findOne(subQuery);
                let planName = 'freemium';
                if (subscription) {
                    const plan = await Plan.findOne({ planId: subscription.planId });
                    if (plan) planName = plan.name.toLowerCase();
                }
                if (planName === 'freemium') {
                    throw new Error("Cellular mode is not available on the Freemium plan. Please upgrade to use cellular sync.");
                }
            }
            device.netMode = netMode;
            netModeChanged = true;
        }

        if (nickname) device.nickname = nickname;
        if (frequency !== undefined) device.frequency = frequency;
        if (batch !== undefined) device.batch = batch;
        if (location) {
            const [latitude, longitude] = location;
            // Re-geocoding logic could be extracted to utility
            try {
                const geoRes = await axios.get(`https://atlas.microsoft.com/search/address/reverse/json`, {
                    params: {
                        'api-version': '1.0',
                        'subscription-key': process.env.AZURE_MAPS_SUBSCRIPTION_KEY, // Check naming consistency
                        query: `${latitude},${longitude}`
                    }
                });
                const address = geoRes?.data?.addresses?.[0]?.address || {};
                device.location = JSON.stringify({
                    country: address.country,
                    region: address.countrySubdivision,
                    city: address.municipality,
                    postalCode: address.postalCode,
                    street: address.street,
                    municipality: address.municipality,
                    municipalitySubdivision: address.municipalitySubdivision,
                    latitude,
                    longitude
                });
            } catch (e) {
                console.warn("Geocoding warning", e.message);
                device.location = JSON.stringify({ latitude, longitude });
            }
        }

        // Notification Preferences
        if (reqBody.notificationPreferences) {
            // Merge existing prefs with new ones to avoid overwriting all fields if partial update
            const newPrefs = reqBody.notificationPreferences;

            // Because it's a subdocument in Mongoose, direct assignment works but merge is safer for UX
            if (!device.notificationPreferences) device.notificationPreferences = {};

            if (typeof newPrefs.enabled === 'boolean') device.notificationPreferences.enabled = newPrefs.enabled;
            if (typeof newPrefs.offlineAlert === 'boolean') device.notificationPreferences.offlineAlert = newPrefs.offlineAlert;
            if (newPrefs.alertThresholdMinutes) device.notificationPreferences.alertThresholdMinutes = newPrefs.alertThresholdMinutes;
            if (Array.isArray(newPrefs.recipients)) device.notificationPreferences.recipients = newPrefs.recipients;
        }

        // Flow Sensor Specialized Configuration
        if (device.model?.toLowerCase() === 'flow') {
            if (reqBody.power_system) {
                const ps = reqBody.power_system;
                if (!device.power_system) device.power_system = {};
                if (ps.architecture) device.power_system.architecture = ps.architecture;
                if (ps.capabilities) {
                    if (typeof ps.capabilities.solar === 'boolean') device.power_system.capabilities.solar = ps.capabilities.solar;
                    if (typeof ps.capabilities.battery === 'boolean') device.power_system.capabilities.battery = ps.capabilities.battery;
                    if (typeof ps.capabilities.ac_input === 'boolean') device.power_system.capabilities.ac_input = ps.capabilities.ac_input;
                }
            }

            if (reqBody.setup) {
                const s = reqBody.setup;
                if (!device.setup) device.setup = {};

                if (typeof s.is_configured === 'boolean') device.setup.is_configured = s.is_configured;
                if (typeof s.requires_configuration === 'boolean') device.setup.requires_configuration = s.requires_configuration;

                if (typeof s.wifi_configured === 'boolean') device.setup.wifi_configured = s.wifi_configured;
                if (typeof s.api_key_generated === 'boolean') device.setup.api_key_generated = s.api_key_generated;
                if (typeof s.tank_calibrated === 'boolean') device.setup.tank_calibrated = s.tank_calibrated;

                if (s.tank_height_mm !== undefined) {
                    device.setup.tank_height_mm = s.tank_height_mm;
                    device.setup.last_calibration_update = new Date();
                }
                if (s.tank_volume_l !== undefined) {
                    device.setup.tank_volume_l = s.tank_volume_l;
                    device.setup.last_calibration_update = new Date();
                }

                if (s.is_configured && !device.setup.setup_completed_at) {
                    device.setup.setup_completed_at = new Date();
                }
            }
        }

        await device.save();
        await CacheService.invalidate(`device:${auid}:meta`);

        // ── Proactive cache warm-up (eliminates stale window after invalidation) ──
        CacheService.warmUp(
            `device:${auid}:meta`,
            () => registerNewDevice.findOne({ auid }).lean(),
            86400
        ).catch(() => {});

        // 📡 AUTO-PUSH to Notecard if frequency, batch, or netMode changed
        if (freqChanged || batchChanged || netModeChanged) {
            notecardService.syncConfigToNotecard(device).catch(() => {}); // Non-blocking, non-fatal
        }

        // 📋 EVENT LOG — config change
        if (freqChanged || batchChanged || netModeChanged) {
            const configAfter = { frequency: device.frequency, batch: device.batch, netMode: device.netMode };
            eventLog.configChanged({
                auid,
                devid:  device.devid,
                userId: userid,
                orgId:  device.organizationId,
                before: configBefore,
                after:  configAfter,
            }).catch(() => {});
        }

        // Attach derived read_interval for informational display
        const plainDevice = device.toObject ? device.toObject() : { ...device };
        plainDevice.read_interval_minutes = parseFloat(
            ((plainDevice.frequency || 10) / (plainDevice.batch || 2)).toFixed(2)
        );

        return plainDevice;
    }

    async deleteDevice(auid) {
        const device = await registerNewDevice.findOne({ auid });
        if (!device) throw new Error('Device not found');

        const { devid, organizationId } = device;

        // Cleanup Logic
        await Deployment.updateMany(
            { devices: auid },
            { $pull: { devices: auid } }
        );

        // Delete associated Threshold Rules
        await Threshold.deleteMany({ deviceAuid: auid });

        await registerNewDevice.findOneAndDelete({ auid });

        await Organization.findOneAndUpdate(
            { organizationId },
            { $pull: { devices: auid } }
        );

        await CacheService.invalidate(`device:${auid}:meta`);

        // AUDIT LOG
        await createAuditLog({
            action: 'DEVICE_DELETE',
            userid: device.userid, // Owner
            organizationId: organizationId,
            details: { auid, devid },
            ipAddress: null
        });

        return { message: "Device deleted and cleaned up" };
    }

    async addCollaborator(auid, email, role, permissions = []) {
        const device = await registerNewDevice.findOne({ auid });
        if (!device) throw new Error('Device not found');

        const user = await User.findOne({ email });
        if (!user) throw new Error('Target user not found');
        if (user.deletedAt) throw new Error('Cannot add a suspended user as a collaborator');

        // Referential Integrity
        const org = await Organization.findOne({
            organizationId: device.organizationId,
            "collaborators.userid": user.userid
        });
        if (!org) throw new Error('Target user must be a member of the organization');

        if (device.deploymentId) {
            const dep = await Deployment.findOne({
                deploymentid: device.deploymentId,
                "collaborators.userid": user.userid
            });
            if (!dep) console.warn(`User ${user.userid} not in deployment`);
        }

        const existsIndex = device.collaborators.findIndex(c => c.userid === user.userid.toString());
        if (existsIndex >= 0) {
            // Idempotent Upsert: Update capabilities if already exists
            device.collaborators[existsIndex].role = role;
            device.collaborators[existsIndex].permissions = permissions;
        } else {
            device.collaborators.push({ userid: user.userid.toString(), role, permissions });
        }

        await device.save();

        this.sendCollaboratorEmail(user.email, role, device.nickname, permissions);

        // INVALIDATION
        await CacheService.invalidate(`device:${auid}:meta`);

        // AUDIT LOG
        await createAuditLog({
            action: 'DEVICE_ADD_COLLABORATOR',
            userid: user.userid, // Added user
            organizationId: device.organizationId,
            details: { auid, role, addedUserEmail: email },
            ipAddress: null
        });

        return device.collaborators;
    }

    async removeCollaborator(auid, email) {
        const device = await registerNewDevice.findOne({ auid });
        if (!device) throw new Error('Device not found');

        const user = await User.findOne({ email });
        if (!user) throw new Error('Target user not found');

        device.collaborators = device.collaborators.filter(c => c.userid !== user.userid.toString());
        await device.save();
        await CacheService.invalidate(`device:${auid}:meta`);

        // AUDIT LOG
        await createAuditLog({
            action: 'DEVICE_REMOVE_COLLABORATOR',
            userid: user.userid, // Removed user
            organizationId: device.organizationId,
            details: { auid, removedUserEmail: email },
            ipAddress: null
        });

        return device.collaborators;
    }

    async getCollaborators(auid) {
        const device = await registerNewDevice.findOne({ auid });
        if (!device) throw new Error('Device not found');

        const collaboratorIds = device.collaborators.map(c => c.userid);
        const users = await User.find({ userid: { $in: collaboratorIds } }, 'userid firstName lastName username email profilePicture status lastActive');

        const hydratedCollaborators = device.collaborators.map(collab => {
            const user = users.find(u => u.userid === collab.userid);
            return {
                userid: collab.userid,
                role: collab.role,
                permissions: collab.permissions,
                addedAt: collab.addedAt,
                user: user ? {
                    firstName: user.firstName,
                    lastName: user.lastName,
                    username: user.username,
                    email: user.email,
                    profilePicture: user.profilePicture,
                    status: user.status,
                    lastActive: user.lastActive
                } : null
            };
        });

        return hydratedCollaborators;
    }

    async getCollaboratorPermissions(req, auid, email) {
        const device = await registerNewDevice.findOne({ auid });
        if (!device) throw new Error('Device not found');

        const { checkDeviceAccessCompatibility } = require('../../../middleware/devices/checkDeviceAccessCompatibility');
        const allowed = await checkDeviceAccessCompatibility(req, device, 'view');
        if (!allowed) throw new Error('Forbidden: You do not have permission to view this device information.');

        const targetUser = await User.findOne({ email });
        if (!targetUser) throw new Error('Target user not found');

        // FIX: Use findOne({ userid: ... }) instead of findById to handle custom string IDs logic
        const ownerUser = await User.findOne({ userid: device.userid });

        if (ownerUser && ownerUser.email === email) {
            return { role: 'owner', permissions: ['*'] };
        }

        const collab = device.collaborators.find(c => c.userid === targetUser.userid.toString());
        if (!collab) throw new Error('Collaborator not found on this device');

        return { role: collab.role, permissions: collab.permissions };
    }

    /**
     * SET DEVICE STATE
     * ─────────────────────────────────────────────────────────────────────
     * Intentionally turns a device ON (active) or OFF (inactive).
     * This is DISTINCT from `status` (online/offline connectivity).
     *
     * Effects:
     *   - Saves state + stateChangedAt + stateChangedBy in MongoDB
     *   - Writes state into Redis metadata hash (no stale data)
     *   - Publishes to device:status-change Pub/Sub (frontend gets it instantly)
     *   - Removes heartbeat from ZSet if going inactive/disabled
     *     (so offline cron doesn't process it)
     *   - Clears alert context to reset escalation
     *
     * @param {string} auid        - Device unique ID
     * @param {string} newState    - 'active' | 'inactive' | 'disabled'
     * @param {string} changedBy   - userid of the operator making this change
     */
    async setDeviceState(auid, newState, changedBy, newNetMode = null) {
        const VALID_STATES = ['active', 'inactive', 'disabled'];
        if (!VALID_STATES.includes(newState)) {
            throw new Error(`Invalid state. Must be one of: ${VALID_STATES.join(', ')}`);
        }
        if (newNetMode && !['cellular', 'wifi'].includes(newNetMode)) {
            throw new Error(`Invalid netMode. Must be one of: 'cellular' or 'wifi'`);
        }

        const device = await registerNewDevice.findOne({ auid });
        if (!device) throw new Error('Device not found');

        const prevState = device.state;
        const prevNetMode = device.netMode || 'cellular';
        if (prevState === newState && (!newNetMode || prevNetMode === newNetMode)) {
            return { message: `Device is already ${newState} and netMode is ${prevNetMode}`, device };
        }

        const now = new Date();

        // 1. Persist to MongoDB
        await registerNewDevice.updateOne(
            { auid },
            {
                $set: {
                    state: newState,
                    stateChangedAt: now,
                    stateChangedBy: changedBy,
                    ...(newNetMode && { netMode: newNetMode }),
                    // If re-activating: keep status as-is (device is not necessarily online yet)
                    // If deactivating: set status to 'inactive' for display clarity
                    ...(newState !== 'active' && { status: newState })
                }
            }
        );

        // 2. Invalidate + warm meta cache atomically
        await CacheService.invalidate(`device:${auid}:meta`);

        // 3. Update Redis metadata hash directly (no stale data in UI)
        try {
            const metaStr = await redisClient.hGet(auid, 'metadata');
            if (metaStr) {
                const meta = JSON.parse(metaStr);
                meta.state = newState;
                meta.stateChangedAt = now.toISOString();
                if (newNetMode) meta.netMode = newNetMode;
                if (newState !== 'active') meta.status = newState;
                await redisClient.hSet(auid, 'metadata', JSON.stringify(meta));
            }
        } catch (e) {
            // Non-fatal: UI will refresh from next telemetry or REST call
        }

        // 4. Publish real-time status-change event to WebSocket bridge
        await redisClient.publish('device:status-change', JSON.stringify({
            auid,
            status: newState !== 'active' ? newState : 'online',
            state: newState,
            netMode: newNetMode || device.netMode || 'cellular',
            stateChangedAt: now.toISOString(),
            changedBy
        }));

        // 5. Heartbeat ZSet management
        if (newState !== 'active') {
            // Remove from heartbeat ZSet → offline cron won't process this device
            try {
                if (typeof redisClient.zRem === 'function') {
                    await redisClient.zRem('devices:heartbeat', auid);
                } else {
                    await redisClient.zrem('devices:heartbeat', auid);
                }
            } catch (e) { /* ignore */ }

            // Clear any pending alert escalation
            await redisClient.del(`device:${auid}:alert_context`);
            await redisClient.del(`device:${auid}:last_alert_time`);
        }

        // 6. Audit Log
        await createAuditLog({
            action: 'DEVICE_STATE_CHANGE',
            userid: changedBy,
            organizationId: device.organizationId,
            details: { auid, prevState, newState, prevNetMode, newNetMode },
            ipAddress: null
        });

        // 7. 📡 Sync new state to physical Notecard device via Notehub env var
        // cc_state: 'active' | 'inactive' | 'disabled'
        // The firmware reads this on the next sync and powers down or wakes up.
        // We reload the device so the mutated state is available for the push.
        const updatedDevice = { 
            ...device.toObject(), 
            state: newState, 
            ...(newNetMode && { netMode: newNetMode }) 
        };
        notecardService.syncStateToNotecard(updatedDevice).catch(() => {}); // Non-blocking, non-fatal

        return {
            message: `Device state changed from '${prevState}' to '${newState}'`,
            auid,
            state: newState,
            netMode: newNetMode || device.netMode || 'cellular',
            stateChangedAt: now,
            stateChangedBy: changedBy
        };
    }

    async setAvailability(auid, availability) {
        const device = await registerNewDevice.findOne({ auid });
        if (!device) throw new Error('Device not found');
        device.availability = availability;
        await device.save();
        await CacheService.invalidate(`device:${auid}:meta`);
        return device;
    }

    async sendCollaboratorEmail(email, role, devName, permissions, opts = {}) {
        const { sendCCEmail } = require('../../../services/email/craftedClimateMailer');
        await sendCCEmail({
            type: 'collaboration.deviceAdded',
            to: email,
            vars: {
                collaboratorName: opts.collaboratorName,
                devName,
                devid:    opts.devid,
                role,
                location: opts.location,
                addedBy:  opts.addedBy,
                permissions: Array.isArray(permissions) ? permissions : [],
                deviceUrl: opts.deviceUrl || process.env.APP_URL,
            },
        });
    }

    /**
     * Get Public Devices for Map
     * Returns: Metadata + Latest Telemetry
     */
    async getPublicDevices({ model, status, online }) {
        const query = { availability: 'public' };

        // 1. Filter by Model
        if (model) {
            query.model = model.toLowerCase();
        }

        // 2. Filter by Status
        // Note: 'online' param is an alias or boolean check for status
        const targetStatus = status || (online === 'true' ? 'online' : null);
        if (targetStatus && targetStatus !== 'all') {
            query.status = targetStatus;
        }

        const devices = await registerNewDevice.find(query).lean();

        // 3. Attach Telemetry (Redis -> Mongo Fallback)
        const results = await Promise.all(devices.map(async (device) => {
            try {
                let latestTelemetry = null;
                const auid = device.auid;

                // A. Try Redis
                const allRedis = await redisClient.hGetAll(auid);

                if (allRedis && Object.keys(allRedis).length > 0) {
                    // Extract latest timestamp key (numeric)
                    const timestamps = Object.keys(allRedis)
                        .filter(k => k !== 'metadata' && k !== 'flushed')
                        .map(Number)
                        .filter(n => !isNaN(n))
                        .sort((a, b) => b - a); // Descending

                    if (timestamps.length > 0) {
                        const latestTs = timestamps[0];
                        try {
                            latestTelemetry = JSON.parse(allRedis[latestTs]);
                        } catch (e) {
                            console.warn(`Failed to parse Redis data for ${auid}`);
                        }
                    }
                }

                // B. Fallback to Mongo if no telemetry in Redis
                if (!latestTelemetry) {
                    const devModel = device.model?.toLowerCase();
                    const M = MODEL_MAP[devModel];
                    if (M) {
                        const dbRecord = await M.findOne({ auid })
                            .sort({ transport_time: -1 })
                            .lean();

                        if (dbRecord) {
                            // Standardize format if needed, or just return record
                            latestTelemetry = dbRecord;
                        }
                    }
                }

                // Construct Public Response Object (Enhanced for Map Display)
                return {
                    metadata: {
                        auid: device.auid,
                        nickname: device.nickname,
                        model: device.model,
                        type: device.type,
                        status: device.status, // online/offline from device registry
                        image: device.image,
                        battery: device.battery || 0,
                        lastSeen: latestTelemetry?.transport_time || latestTelemetry?.timestamp || null
                    },
                    location: device.location ? JSON.parse(device.location) : null,
                    telemetry: latestTelemetry
                };
            } catch (err) {
                console.error(`Error processing public device ${device.auid}:`, err);
                return null; // Skip errored devices
            }
        }));

        return results.filter(Boolean);
    }

    /**
     * Get Public Sensor Models
     * Returns: List of distinct sensor models available in public devices
     */
    async getPublicSensorModels() {
        const models = await registerNewDevice.distinct('model', { availability: 'public' });
        return models.filter(Boolean).sort();
    }


    /**
     * 🚚 TRANSFER DEVICE
     * Move device to a new Organization.
     * - Cleans up old Org/Deployment links
     * - Filters collaborators (removes those not in new Org)
     */
    async transferDevice(userid, auid, targetOrgId, targetDeploymentId = null) {
        // 1. Fetch Device
        const device = await registerNewDevice.findOne({ auid });
        if (!device) throw new Error('Device not found');

        // 2. Auth: Only Owner can transfer
        if (device.userid !== userid && device.ownerUserId !== userid) {
            throw new Error("Unauthorized: Only the device owner can transfer this device.");
        }

        const oldOrgId = device.organizationId;
        if (oldOrgId === targetOrgId) {
            throw new Error("Device is already in this organization.");
        }

        // 3. Verify Target Org
        const targetOrg = await Organization.findOne({ organizationId: targetOrgId, deletedAt: null });
        if (!targetOrg) throw new Error("Target Organization not found.");

        // 4. Verify Owner Membership in Target Org
        const ownerMember = targetOrg.collaborators.find(c => c.userid === userid);
        if (!ownerMember) {
            throw new Error("You must be a member of the target organization to transfer devices there.");
        }

        // 5. Intelligent Collaborator Cleanup
        // Rule: Keep collaborators ONLY if they are members of the NEW organization
        const validCollaborators = [];
        const removedCollaborators = [];

        if (device.collaborators && device.collaborators.length > 0) {
            for (const collab of device.collaborators) {
                const isMemberStart = targetOrg.collaborators.some(c => c.userid === collab.userid);
                if (isMemberStart) {
                    validCollaborators.push(collab);
                } else {
                    removedCollaborators.push(collab.userid);
                }
            }
        }
        device.collaborators = validCollaborators;

        // 6. Deployment Handling
        // Clean up OLD deployment
        if (device.deploymentId) {
            await Deployment.updateOne(
                { deploymentid: device.deploymentId },
                { $pull: { devices: auid } }
            );
        }

        // Verify/Set NEW deployment (if provided)
        if (targetDeploymentId) {
            const newDep = await Deployment.findOne({ deploymentid: targetDeploymentId, organizationId: targetOrgId });
            if (!newDep) throw new Error("Target Deployment not found in target Organization.");

            device.deploymentId = targetDeploymentId;
            device.deployment = targetDeploymentId; // legacy sync

            await Deployment.updateOne(
                { deploymentid: targetDeploymentId },
                { $addToSet: { devices: auid } }
            );
        } else {
            device.deploymentId = null;
            device.deployment = null;
        }

        // 7. Update Organization Links
        // Remove from Old Org
        if (oldOrgId) {
            await Organization.updateOne(
                { organizationId: oldOrgId },
                { $pull: { devices: auid } }
            );
        }

        // Add to New Org
        await Organization.updateOne(
            { organizationId: targetOrgId },
            { $addToSet: { devices: auid } }
        );

        // 8. Final Save
        device.organizationId = targetOrgId;
        device.organization = targetOrgId; // legacy sync
        await device.save();

        // 9. Invalidate & Log
        await CacheService.invalidate(`device:${auid}:meta`);
        await CacheService.invalidate(`org:${oldOrgId}:meta`);
        await CacheService.invalidate(`org:${targetOrgId}:meta`);

        await createAuditLog({
            action: 'DEVICE_TRANSFER',
            userid: userid,
            organizationId: targetOrgId,
            details: {
                auid,
                fromOrg: oldOrgId,
                toOrg: targetOrgId,
                removedCollaboratorsCount: removedCollaborators.length
            },
            ipAddress: null
        });

        return {
            message: "Device transferred successfully",
            targetOrgId,
            removedCollaborators
        };
    }

    /**
     * 🚚 BATCH TRANSFER DEVICES
     */
    async transferDevicesBatch(userid, auids, targetOrgId, targetDeploymentId = null) {
        if (!Array.isArray(auids) || auids.length === 0) {
            throw new Error("Device auids array is required and must not be empty.");
        }

        const results = [];
        const errors = [];

        for (const auid of auids) {
            try {
                const res = await this.transferDevice(userid, auid, targetOrgId, targetDeploymentId);
                results.push({ auid, status: 'success', message: res.message });
            } catch (err) {
                errors.push({ auid, status: 'failed', error: err.message });
            }
        }

        return {
            successCount: results.length,
            failedCount: errors.length,
            results,
            errors
        };
    }
}

module.exports = new RegistryService();
