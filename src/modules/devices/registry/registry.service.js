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
    async registerDevice({ auid, serial, location, nickname, userid, organizationId }) {
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
            status: 'offline',
            availability: 'private',
            manufacturingId: manufactured.manufacturingId,
        });

        await newDevice.save();

        // 6. Link to Org
        await Organization.updateOne(
            { organizationId },
            { $addToSet: { devices: auid } }
        );

        // AUDIT LOG
        await createAuditLog({
            action: 'DEVICE_REGISTER',
            userid: userid,
            organizationId: organizationId,
            details: { auid, serial, model: manufactured.model },
            ipAddress: null
        });

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

        const { nickname, location } = reqBody;

        if (nickname) device.nickname = nickname;
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
        return device;
    }

    async deleteDevice(auid) {
        const device = await registerNewDevice.findOne({ auid });
        if (!device) throw new Error('Device not found');

        const { devid, organizationId } = device;

        // Cleanup Logic
        await Deployment.updateMany(
            { devices: devid },
            { $pull: { devices: devid } }
        );

        // Delete associated Threshold Rules
        await Threshold.deleteMany({ deviceAuid: auid });

        await registerNewDevice.findOneAndDelete({ auid });

        await Organization.findByIdAndUpdate(
            organizationId,
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

    async setAvailability(auid, availability) {
        const device = await registerNewDevice.findOne({ auid });
        if (!device) throw new Error('Device not found');
        device.availability = availability;
        await device.save();
        await CacheService.invalidate(`device:${auid}:meta`);
        return device;
    }

    async sendCollaboratorEmail(email, role, devName, permissions) {
        const emailContent = `
          <p>Hi there,</p>
          <p>You’ve been added as a <strong>${role}</strong> on the device <strong>${devName}</strong>.</p>
          <p>Permissions: ${permissions.join(', ')}.</p>
          <p>CraftedClimate Team</p>
        `;
        await sendEmail(email, `Added as collaborator on ${devName}`, emailContent);
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
                { $addToSet: { devices: device.devid } }
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
}

module.exports = new RegistryService();
