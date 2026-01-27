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

            if (typeof newPrefs.offlineAlert === 'boolean') device.notificationPreferences.offlineAlert = newPrefs.offlineAlert;
            if (newPrefs.alertThresholdMinutes) device.notificationPreferences.alertThresholdMinutes = newPrefs.alertThresholdMinutes;
            if (Array.isArray(newPrefs.recipients)) device.notificationPreferences.recipients = newPrefs.recipients;
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
        return { message: "Device deleted and cleaned up" };
    }

    async addCollaborator(auid, email, role, permissions = []) {
        const device = await registerNewDevice.findOne({ auid });
        if (!device) throw new Error('Device not found');

        const user = await User.findOne({ email });
        if (!user) throw new Error('Target user not found');

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

        const exists = device.collaborators.find(c => c.userid === user.userid.toString());
        if (exists) throw new Error('Collaborator already exists');

        device.collaborators.push({ userid: user.userid.toString(), role, permissions });
        await device.save();

        this.sendCollaboratorEmail(user.email, role, device.nickname, permissions);

        // INVALIDATION
        await CacheService.invalidate(`device:${auid}:meta`);
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
        return device.collaborators;
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
}

module.exports = new RegistryService();
