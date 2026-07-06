const Deployment = require('../../../models/deployment/deploymentModel');
const RegisteredDevice = require('../../../models/devices/registerDevice');
const Organization = require('../../../models/organization/organizationModel');
const User = require('../../../models/user/userModel');
const registryService = require('../registry/registry.service');
const notecardService = require('../notecard/notecard.service');
const { nanoid } = require('nanoid');

class DeploymentService {
    async createDeployment({ name, description, userid, organizationId }) {
        const existing = await Deployment.findOne({ organizationId, name, deletedAt: null });
        if (existing) throw new Error("Deployment name already exists in this organization.");

        const deploymentid = `dep-${nanoid(12)}`;

        const deployment = await Deployment.create({
            deploymentid,
            userid,
            createdBy: userid,
            organizationId,
            name,
            description
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

    async updateDeployment(deploymentId, organizationId, { name, description }) {
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

        if (description) deployment.description = description;
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

    async listDeployments(organizationId) {
        return await Deployment.find({ organizationId, deletedAt: null });
    }
}

module.exports = new DeploymentService();
