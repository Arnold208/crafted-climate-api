const Deployment = require('../../../models/deployment/deploymentModel');
const RegisteredDevice = require('../../../models/devices/registerDevice');
const Organization = require('../../../models/organization/organizationModel');
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
        const deployment = await this.getDeployment(deploymentId, organizationId);
        if (!deployment) throw new Error('Deployment not found');

        // Unassign devices from this deployment so they can be reused?
        // Or keep them assigned to the "deleted" deployment for history?
        // Usage: "Devices can be reassigned"
        // Let's release them.
        await RegisteredDevice.updateMany(
            { deployment: deploymentId },
            { $set: { deployment: null, deploymentId: null } }
        );

        // SOFT DELETE
        deployment.deletedAt = new Date();
        await deployment.save();

        // Do NOT pull from Org if preserving history, or DO pull?
        // Consistency: if we soft delete, we usually keep links but filter queries.
        // await Organization.findOneAndUpdate(
        //     { organizationId },
        //     { $pull: { deployments: deploymentId } },
        //     { new: true }
        // );
        return { message: "Deployment deleted successfully" };
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

        // Device remains in organization, so we strictly do NOT remove from org
        // Sync logic in original code removed from org.devices which might be wrong if devices belong to org? 
        // Original code: { $pull: { devices: auid } }
        // Wait, if I remove it from org.devices, the device is orphaned from Org? 
        // Original code comment: // (Device remains in org.devices even though it's removed from deployment)
        // BUT the code did: { $pull: { devices: auid } }. This looks like a BUG in original code or INTENTIONAL?
        // Re-reading original Code: 
        //   // 🔗 REFERENTIAL INTEGRITY: Ensure organization devices array is still synced
        //   // (Device remains in org.devices even though it's removed from deployment)
        //   await Organization.findOneAndUpdate(..., { $pull: { devices: auid } } ...)
        // That comment says "remains" but code does "$pull". 
        // However, `addDeviceToDeployment` adds to org.devices via `$addToSet`. 
        // `registerDevice` also adds to org.devices.
        // If I pull it here, I am removing it from the Org entirely? That seems wrong for just removing from deployment.
        // But I must follow the original logic unless obviously broken. 
        // Actually, looking closely, `addDeviceToDeployment` DOES add to org.devices. 
        // If `registerDevice` adds it, then `add` is redundant (safe via addToSet). 
        // If `remove` pulls it, then we lose the record that device is in Org.
        // CHECK: `registerDevice` (in userdevice.js/registry.service.js) adds to Org. 
        // So hitting `removeDeviceFromDeployment` causing removal from Org seems like a SIDE EFFECT.
        // Refactoring guideline: "leaving no part of the original codebase untouched or broken."
        // If I fix it, I might break expected behavior. 
        // Let's stick to the code:
        await Organization.findOneAndUpdate(
            { organizationId },
            { $pull: { devices: auid } },
            { new: true }
        );

        return { message: 'Device removed successfully from deployment' };
    }

    async listDeployments(organizationId) {
        return await Deployment.find({ organizationId, deletedAt: null });
    }
}

module.exports = new DeploymentService();
