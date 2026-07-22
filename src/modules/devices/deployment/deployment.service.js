const Deployment = require('../../../models/deployment/deploymentModel');
const RegisteredDevice = require('../../../models/devices/registerDevice');
const Organization = require('../../../models/organization/organizationModel');
const User = require('../../../models/user/userModel');
const registryService = require('../registry/registry.service');
const notecardService = require('../notecard/notecard.service');
const { nanoid } = require('nanoid');

class DeploymentService {
    async createDeployment({ name, description, siteType, location, nextMaintenanceDate, file, userid, organizationId }) {
        const existing = await Deployment.findOne({ organizationId, name, deletedAt: null });
        if (existing) throw new Error("Deployment name already exists in this organization.");

        const deploymentid = `dep-${nanoid(12)}`;

        // Handle image upload to Azure Blob Storage
        let imageUrl = null;
        if (file) {
            const { containerClient, generateSignedUrl } = require('../../../config/storage/storage');
            const fileName = `upload-${Date.now()}-${file.originalname}`;
            const blockBlobClient = containerClient.getBlockBlobClient(fileName);
            await blockBlobClient.upload(file.buffer, file.size, {
                blobHTTPHeaders: { blobContentType: file.mimetype },
            });
            imageUrl = generateSignedUrl(fileName);
        }

        // Handle location parsing and reverse-geocoding via Azure Maps
        let resolvedLocation = null;
        if (location) {
            let coords = null;
            if (typeof location === 'string') {
                try {
                    coords = JSON.parse(location);
                } catch (e) {
                    coords = location.split(',').map(Number).filter(n => !isNaN(n));
                }
            } else if (Array.isArray(location)) {
                coords = location;
            }

            if (coords && coords.length === 2) {
                const [latitude, longitude] = coords;
                let locationInfo = { latitude, longitude };
                try {
                    const axios = require('axios');
                    const geoRes = await axios.get(`${process.env.AZURE_MAPS_BASE_URL || 'https://atlas.microsoft.com'}/search/address/reverse/json`, {
                        params: {
                            'api-version': '1.0',
                            'subscription-key': process.env.AZURE_MAPS_SUBSCRIPTION_KEY,
                            query: `${latitude},${longitude}`,
                        },
                        timeout: 5000
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
                        formattedAddress: geoRes?.data?.addresses?.[0]?.address?.freeformAddress || ''
                    };
                } catch (err) {
                    console.warn("[DeploymentService] Geocoding failed:", err.message);
                }
                resolvedLocation = JSON.stringify(locationInfo);
            }
        }

        let resolvedMaintenanceDate = null;
        if (nextMaintenanceDate) {
            const d = new Date(nextMaintenanceDate);
            if (!isNaN(d.getTime())) resolvedMaintenanceDate = d;
        }

        const deployment = await Deployment.create({
            deploymentid,
            userid,
            createdBy: userid,
            organizationId,
            name,
            description,
            siteType: siteType || null,
            location: resolvedLocation,
            nextMaintenanceDate: resolvedMaintenanceDate,
            imageUrl
        });

        try {
            const org = await Organization.findOneAndUpdate(
                { organizationId },
                { $addToSet: { deployments: deploymentid } },
                { new: true }
            );
            if (!org) {
                throw new Error("Organization not found");
            }
        } catch (err) {
            // Rollback deployment creation
            await Deployment.deleteOne({ deploymentid });
            throw err;
        }

        return deployment;
    }

    async getDeployment(deploymentId, organizationId) {
        return await Deployment.findOne({ deploymentid: deploymentId, organizationId, deletedAt: null });
    }

    async listDevicesInDeployment(deploymentId, organizationId) {
        const deployment = await this.getDeployment(deploymentId, organizationId);
        if (!deployment) throw new Error("Deployment not found in this organization");

        return await RegisteredDevice.find({
            auid: { $in: deployment.devices },
            organizationId
        });
    }

    async updateDeployment(deploymentId, organizationId, { name, description, siteType, location, nextMaintenanceDate, file }) {
        const deployment = await this.getDeployment(deploymentId, organizationId);
        if (!deployment) throw new Error('Deployment not found');

        if (name && name !== deployment.name) {
            const duplicate = await Deployment.findOne({
                deploymentid: { $ne: deploymentId },
                name,
                organizationId
            });
            if (duplicate) throw new Error("A deployment with this name already exists.");
            deployment.name = name;
        }

        if (description !== undefined) deployment.description = description;
        if (siteType !== undefined) deployment.siteType = siteType || null;

        if (file) {
            const { containerClient, generateSignedUrl } = require('../../../config/storage/storage');
            const fileName = `upload-${Date.now()}-${file.originalname}`;
            const blockBlobClient = containerClient.getBlockBlobClient(fileName);
            await blockBlobClient.upload(file.buffer, file.size, {
                blobHTTPHeaders: { blobContentType: file.mimetype },
            });
            deployment.imageUrl = generateSignedUrl(fileName);
        }

        if (location !== undefined) {
            let resolvedLocation = null;
            if (location) {
                let coords = null;
                if (typeof location === 'string') {
                    try {
                        coords = JSON.parse(location);
                    } catch (e) {
                        coords = location.split(',').map(Number).filter(n => !isNaN(n));
                    }
                } else if (Array.isArray(location)) {
                    coords = location;
                }

                if (coords && coords.length === 2) {
                    const [latitude, longitude] = coords;
                    let locationInfo = { latitude, longitude };
                    try {
                        const axios = require('axios');
                        const geoRes = await axios.get(`${process.env.AZURE_MAPS_BASE_URL || 'https://atlas.microsoft.com'}/search/address/reverse/json`, {
                            params: {
                                'api-version': '1.0',
                                'subscription-key': process.env.AZURE_MAPS_SUBSCRIPTION_KEY,
                                query: `${latitude},${longitude}`,
                            },
                            timeout: 5000
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
                            formattedAddress: geoRes?.data?.addresses?.[0]?.address?.freeformAddress || ''
                        };
                    } catch (err) {
                        console.warn("[DeploymentService] Geocoding failed:", err.message);
                    }
                    resolvedLocation = JSON.stringify(locationInfo);
                }
            }
            deployment.location = resolvedLocation;
        }

        if (nextMaintenanceDate !== undefined) {
            let resolvedMaintenanceDate = null;
            if (nextMaintenanceDate) {
                const d = new Date(nextMaintenanceDate);
                if (!isNaN(d.getTime())) resolvedMaintenanceDate = d;
            }
            deployment.nextMaintenanceDate = resolvedMaintenanceDate;
        }

        return await deployment.save();
    }

    async deleteDeployment(deploymentId, organizationId) {
        const deployment = await this.getDeployment(deploymentId, organizationId);
        if (!deployment) throw new Error('Deployment not found');

        const deviceIds = deployment.devices; // Store before clearing

        // 1. Restore individual device configurations on Notehub (so they don't lose their settings)
        const devices = await RegisteredDevice.find({ auid: { $in: deviceIds } });
        for (const device of devices) {
            if (device.noteDevUuid) {
                try {
                    device.deployment = null;
                    device.deploymentId = null;
                    await notecardService.syncConfigToNotecard(device);
                } catch (err) {
                    console.warn(`[Deployment] Failed to restore config for device ${device.auid} on deployment deletion:`, err.message);
                }
            }
        }

        // 2. Unassign devices in MongoDB
        await RegisteredDevice.updateMany(
            { deployment: deploymentId },
            { $set: { deployment: null, deploymentId: null } }
        );

        // 3. Delete all mapped fleets on Notehub
        if (deployment.notehubFleets) {
            for (const [model, fleetUid] of deployment.notehubFleets.entries()) {
                try {
                    const projectUid = notecardService.resolveProjectUid(model);
                    if (projectUid && fleetUid) {
                        await notecardService.deleteFleet(projectUid, fleetUid);
                    }
                } catch (err) {
                    console.warn(`[Deployment] Failed to delete fleet ${fleetUid} for model ${model} on Notehub:`, err.message);
                }
            }
        }

        deployment.deletedAt = new Date();
        await deployment.save();

        // CACHE INVALIDATION
        const CacheService = require('../../../modules/common/cache.service');
        for (const auid of deviceIds) {
            await CacheService.invalidate(`device:${auid}:meta`);
        }

        return { message: "Deployment deleted successfully" };
    }

    async addCollaborator(deploymentId, organizationId, email, role) {
        const user = await User.findOne({ email });
        if (!user) throw new Error("User not found");

        const deployment = await this.getDeployment(deploymentId, organizationId);
        if (!deployment) throw new Error("Deployment not found");

        // Save original collaborators in case of rollback
        const originalCollaborators = [...deployment.collaborators.map(c => ({ userid: c.userid, role: c.role }))];

        // 1. Upsert into Deployment
        const existsIndex = deployment.collaborators.findIndex(c => c.userid === user.userid.toString());
        if (existsIndex >= 0) {
            deployment.collaborators[existsIndex].role = role;
        } else {
            deployment.collaborators.push({ userid: user.userid.toString(), role });
        }
        await deployment.save();

        try {
            // 2. Sync to Devices (Auto-Permissions)
            const deviceRole = 'device-user';
            const devicePermissions = ['view', 'export'];

            for (const auid of deployment.devices) {
                await registryService.addCollaborator(auid, email, deviceRole, devicePermissions);
            }
        } catch (err) {
            // Rollback deployment collaborator update
            deployment.collaborators = originalCollaborators;
            await deployment.save();
            throw err;
        }

        // CACHE INVALIDATION
        const CacheService = require('../../../modules/common/cache.service');
        for (const auid of deployment.devices) {
            await CacheService.invalidate(`device:${auid}:meta`);
        }

        return deployment.collaborators;
    }

    async removeCollaborator(deploymentId, organizationId, email) {
        const user = await User.findOne({ email });
        if (!user) throw new Error("User not found");

        const deployment = await this.getDeployment(deploymentId, organizationId);
        if (!deployment) throw new Error("Deployment not found");

        // Save original collaborators in case of rollback
        const originalCollaborators = [...deployment.collaborators.map(c => ({ userid: c.userid, role: c.role }))];

        // 1. Remove from Deployment
        deployment.collaborators = deployment.collaborators.filter(c => c.userid !== user.userid.toString());
        await deployment.save();

        try {
            // 2. Remove from ALL devices
            for (const auid of deployment.devices) {
                await registryService.removeCollaborator(auid, email);
            }
        } catch (err) {
            // Rollback deployment collaborator update
            deployment.collaborators = originalCollaborators;
            await deployment.save();
            throw err;
        }

        // CACHE INVALIDATION
        const CacheService = require('../../../modules/common/cache.service');
        for (const auid of deployment.devices) {
            await CacheService.invalidate(`device:${auid}:meta`);
        }

        return deployment.collaborators;
    }

    async addDeviceToDeployment(deploymentId, organizationId, auid) {
        const deployment = await this.getDeployment(deploymentId, organizationId);
        if (!deployment) throw new Error('Deployment not found');

        const device = await RegisteredDevice.findOne({ auid, organizationId });
        if (!device) throw new Error('Device not found in this organization');
        if (device.deployment) throw new Error('Device already belongs to a deployment');

        // Update device
        device.deployment = deploymentId;
        device.deploymentId = deploymentId;
        await device.save();

        let addedToFleet = false;
        let projectUid = null;
        let fleetUid = null;

        try {
            // Update deployment
            deployment.devices.push(auid);
            await deployment.save();

            // Notehub Fleet association and overrides cleanup
            if (device.noteDevUuid) {
                const cleanModel = device.model.trim().toLowerCase();
                projectUid = notecardService.resolveProjectUid(cleanModel);
                if (projectUid) {
                    // Get or create Notehub Fleet dynamically
                    fleetUid = deployment.notehubFleets ? deployment.notehubFleets.get(cleanModel) : null;
                    if (!fleetUid) {
                        const label = `${deployment.name} - ${cleanModel}`;
                        fleetUid = await notecardService.createFleet(projectUid, label);
                        if (!deployment.notehubFleets) {
                            deployment.notehubFleets = new Map();
                        }
                        deployment.notehubFleets.set(cleanModel, fleetUid);
                        await deployment.save();
                    }

                    // Add device to fleet
                    await notecardService.addDeviceToFleet(projectUid, fleetUid, device.noteDevUuid);
                    addedToFleet = true;
                } else {
                    console.warn(`[Deployment] No project UID configured for model: ${device.model}`);
                }
            }

            // Update organization
            await Organization.findOneAndUpdate(
                { organizationId },
                { $addToSet: { devices: auid } },
                { new: true }
            );

            // SYNC: Add existing Deployment Collaborators to this new Device
            if (deployment.collaborators && deployment.collaborators.length > 0) {
                for (const collab of deployment.collaborators) {
                    try {
                        const user = await User.findOne({ userid: collab.userid });
                        if (user) {
                            await registryService.addCollaborator(auid, user.email, 'device-user', ['view', 'export']);
                        }
                    } catch (e) {
                        console.warn(`[Deployment] Failed to sync existing deployment collab to new device ${auid}`, e.message);
                    }
                }
            }
        } catch (err) {
            // Notehub Rollback
            if (addedToFleet && projectUid && fleetUid && device.noteDevUuid) {
                try {
                    await notecardService.removeDeviceFromFleet(projectUid, fleetUid, device.noteDevUuid);
                } catch (fleetErr) {
                    console.error(`[Deployment] Failed to remove device ${device.noteDevUuid} from fleet on rollback:`, fleetErr.message);
                }
            }

            // Rollback device updates
            device.deployment = null;
            device.deploymentId = null;
            await device.save();

            // Rollback deployment array update
            deployment.devices = deployment.devices.filter(id => id !== auid);
            await deployment.save();

            throw err;
        }

        // CACHE INVALIDATION
        const CacheService = require('../../../modules/common/cache.service');
        await CacheService.invalidate(`device:${auid}:meta`);

        return { message: 'Device added successfully to deployment' };
    }

    async removeDeviceFromDeployment(deploymentId, organizationId, auid) {
        const deployment = await this.getDeployment(deploymentId, organizationId);
        if (!deployment) throw new Error('Deployment not found');

        const device = await RegisteredDevice.findOne({ auid, organizationId });
        if (!device || device.deployment !== deploymentId) {
            throw new Error("Device does not belong to this deployment");
        }

        // Save original deployment settings in case of rollback
        const originalDeployment = device.deployment;
        const originalDeploymentId = device.deploymentId;

        // Update device
        device.deployment = null;
        device.deploymentId = null;
        await device.save();

        let removedFromFleet = false;
        let projectUid = null;
        let fleetUid = null;

        try {
            // Update deployment
            deployment.devices = deployment.devices.filter(id => id !== auid);
            await deployment.save();

            // Notehub Fleet removal and restore configuration to device level
            if (device.noteDevUuid) {
                const cleanModel = device.model.trim().toLowerCase();
                projectUid = notecardService.resolveProjectUid(cleanModel);
                fleetUid = deployment.notehubFleets ? deployment.notehubFleets.get(cleanModel) : null;

                if (projectUid && fleetUid) {
                    await notecardService.removeDeviceFromFleet(projectUid, fleetUid, device.noteDevUuid);
                    removedFromFleet = true;

                    // Sync the device's specific configuration back to device level on Notehub
                    await notecardService.syncConfigToNotecard(device);
                } else {
                    console.warn(`[Deployment] Could not remove device ${device.noteDevUuid} from Fleet: projectUid or fleetUid missing.`);
                }
            }
        } catch (err) {
            // Notehub Rollback
            if (removedFromFleet && projectUid && fleetUid && device.noteDevUuid) {
                try {
                    await notecardService.addDeviceToFleet(projectUid, fleetUid, device.noteDevUuid);
                } catch (fleetErr) {
                    console.error(`[Deployment] Failed to re-add device ${device.noteDevUuid} to fleet on rollback:`, fleetErr.message);
                }
            }

            // Rollback device updates
            device.deployment = originalDeployment;
            device.deploymentId = originalDeploymentId;
            await device.save();
            throw err;
        }

        // CACHE INVALIDATION
        const CacheService = require('../../../modules/common/cache.service');
        await CacheService.invalidate(`device:${auid}:meta`);

        return { message: 'Device removed successfully from deployment' };
    }

    async listDeployments(organizationId, { search, siteType, region } = {}) {
        const query = { organizationId, deletedAt: null };

        if (siteType) {
            query.siteType = siteType;
        }

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { location: { $regex: search, $options: 'i' } }
            ];
        }

        if (region) {
            query.location = { $regex: region, $options: 'i' };
        }

        const deployments = await Deployment.find(query);

        // Hydrate each deployment with computed metrics
        const hydratedDeployments = [];
        let totalDevicesAcrossAll = 0;
        let onlineDevicesAcrossAll = 0;

        for (const dep of deployments) {
            const devices = await RegisteredDevice.find({
                auid: { $in: dep.devices },
                organizationId,
                deletedAt: null
            });

            const devicesCount = devices.length;
            totalDevicesAcrossAll += devicesCount;

            const onlineCount = devices.filter(d => d.status === 'online').length;
            onlineDevicesAcrossAll += onlineCount;

            // Determine status
            let status = 'Good';
            if (devicesCount > 0) {
                if (onlineCount === 0) {
                    status = 'Attention';
                } else if (onlineCount < devicesCount) {
                    status = 'Moderate';
                }
            }

            // Find last update
            let lastUpdate = null;
            if (devicesCount > 0) {
                const dates = devices.map(d => d.updatedAt || d.createdAt).filter(Boolean);
                if (dates.length > 0) {
                    lastUpdate = new Date(Math.max(...dates.map(d => d.getTime())));
                }
            }

            const uptime = devicesCount
                ? ((onlineCount / devicesCount) * 100).toFixed(1) + '%'
                : '100.0%';

            hydratedDeployments.push({
                ...dep.toObject(),
                devicesCount,
                status,
                uptime,
                lastUpdate
            });
        }

        const totalSites = deployments.length;
        const averageUptime = totalDevicesAcrossAll
            ? ((onlineDevicesAcrossAll / totalDevicesAcrossAll) * 100).toFixed(1) + '%'
            : '100.0%';

        // Active Alert calculation: number of offline devices
        const activeAlerts = totalDevicesAcrossAll - onlineDevicesAcrossAll;

        return {
            summary: {
                totalSites,
                totalDevices: totalDevicesAcrossAll,
                averageUptime,
                activeAlerts
            },
            deployments: hydratedDeployments
        };
    }
}

module.exports = new DeploymentService();
