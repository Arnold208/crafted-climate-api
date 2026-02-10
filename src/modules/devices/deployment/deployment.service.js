const Deployment = require('../../../models/deployment/deploymentModel');
const RegisteredDevice = require('../../../models/devices/registerDevice');
const Organization = require('../../../models/organization/organizationModel');
const User = require('../../../models/user/userModel');
const registryService = require('../registry/registry.service');
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

        await Organization.findOneAndUpdate(
            { organizationId },
            { $addToSet: { deployments: deploymentid } },
            { new: true }
        );

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
        // ... (existing implementation) ...
        const deployment = await this.getDeployment(deploymentId, organizationId);
        if (!deployment) throw new Error('Deployment not found');

        // Unassign devices
        const deviceIds = deployment.devices; // Store before clearing
        await RegisteredDevice.updateMany(
            { deployment: deploymentId },
            { $set: { deployment: null, deploymentId: null } }
        );

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

        // 1. Upsert into Deployment
        const existsIndex = deployment.collaborators.findIndex(c => c.userid === user.userid.toString());
        if (existsIndex >= 0) {
            deployment.collaborators[existsIndex].role = role;
        } else {
            deployment.collaborators.push({ userid: user.userid.toString(), role });
        }
        await deployment.save();

        // 2. Sync to Devices (Auto-Permissions)
        // Default: 'device-user' with 'view', 'export'
        const deviceRole = 'device-user';
        const devicePermissions = ['view', 'export'];

        for (const auid of deployment.devices) {
            try {
                await registryService.addCollaborator(auid, email, deviceRole, devicePermissions);
            } catch (err) {
                console.warn(`[Deployment] Failed to sync collaborator to device ${auid}:`, err.message);
            }
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

        // 1. Remove from Deployment
        deployment.collaborators = deployment.collaborators.filter(c => c.userid !== user.userid.toString());
        await deployment.save();

        // 2. Remove from ALL devices
        for (const auid of deployment.devices) {
            try {
                await registryService.removeCollaborator(auid, email);
            } catch (err) {
                console.warn(`[Deployment] Failed to remove collaborator from device ${auid}:`, err.message);
            }
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

        device.deployment = deploymentId;
        device.deploymentId = deploymentId;
        await device.save();

        deployment.devices.push(auid);
        await deployment.save();

        await Organization.findOneAndUpdate(
            { organizationId },
            { $addToSet: { devices: auid } },
            { new: true }
        );

        // SYNC: Add existing Deployment Collaborators to this new Device
        if (deployment.collaborators && deployment.collaborators.length > 0) {
            for (const collab of deployment.collaborators) {
                try {
                    // We need email for registryService.addCollaborator
                    const user = await User.findOne({ userid: collab.userid });
                    if (user) {
                        await registryService.addCollaborator(auid, user.email, 'device-user', ['view', 'export']);
                    }
                } catch (e) {
                    console.warn(`[Deployment] Failed to sync existing deployment collab to new device ${auid}`, e.message);
                }
            }
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

        device.deployment = null;
        device.deploymentId = null;
        await device.save();

        deployment.devices = deployment.devices.filter(id => id !== auid);
        await deployment.save();

        // FIX: Device remains in organization, so we strictly do NOT remove from org
        // Removed the Organization.findOneAndUpdate pull logic.

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
