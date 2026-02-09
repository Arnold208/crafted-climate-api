const RegisteredDevice = require('../../models/devices/registerDevice');
const Deployment = require('../../models/deployment/deploymentModel');
const Organization = require('../../models/organization/organizationModel');
const axios = require('axios');

class OrganizationDevicesController {
    // List Devices
    async listDevices(req, res) {
        try {
            const { orgId } = req.params;
            const currentOrgId = req.currentOrgId;

            if (currentOrgId && currentOrgId !== orgId) {
                return res.status(400).json({ message: 'Organization mismatch' });
            }

            const effectiveOrgId = currentOrgId || orgId;
            const devices = await RegisteredDevice.find({
                organization: effectiveOrgId,
                deletedAt: null
            });
            res.status(200).json(devices);
        } catch (err) {
            res.status(500).json({ message: 'Server error', error: err.message });
        }
    }

    // Get Single Device
    async getDevice(req, res) {
        try {
            const { orgId, auid } = req.params;
            const currentOrgId = req.currentOrgId;

            if (currentOrgId && currentOrgId !== orgId) {
                return res.status(400).json({ message: 'Organization mismatch' });
            }

            const effectiveOrgId = currentOrgId || orgId;
            const device = await RegisteredDevice.findOne({
                auid,
                organization: effectiveOrgId,
                deletedAt: null
            });

            if (!device) return res.status(404).json({ message: 'Device not found in this organization' });
            res.status(200).json(device);
        } catch (err) {
            res.status(500).json({ message: 'Server error', error: err.message });
        }
    }

    // Update Device (Nickname/Location)
    async updateDevice(req, res) {
        try {
            const { orgId, auid } = req.params;
            const { nickname, location } = req.body;

            if (!nickname && !location) return res.status(400).json({ message: 'Provide nickname or location' });

            const currentOrgId = req.currentOrgId;
            if (currentOrgId && currentOrgId !== orgId) return res.status(400).json({ message: 'Organization mismatch' });

            const effectiveOrgId = currentOrgId || orgId;
            const device = await RegisteredDevice.findOne({
                auid,
                organization: effectiveOrgId,
                deletedAt: null
            });

            if (!device) return res.status(404).json({ message: 'Device not found in this organization' });

            if (nickname) device.nickname = nickname;

            if (location) {
                if (!Array.isArray(location) || location.length !== 2) {
                    return res.status(400).json({ message: 'Invalid location format' });
                }
                const [latitude, longitude] = location;
                const geoRes = await axios.get(`https://atlas.microsoft.com/search/address/reverse/json`, {
                    params: {
                        'api-version': '1.0',
                        'subscription-key': process.env.AZURE_MAPS_KEY,
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
            }

            await device.save();
            res.status(200).json({ message: 'Device updated successfully', device });
        } catch (err) {
            res.status(500).json({ message: 'Server error', error: err.message });
        }
    }

    // Delete Device (Org Scoped)
    async deleteDevice(req, res) {
        try {
            const { orgId, auid } = req.params;
            const currentOrgId = req.currentOrgId;

            if (currentOrgId && currentOrgId !== orgId) return res.status(400).json({ message: 'Organization mismatch' });

            const effectiveOrgId = currentOrgId || orgId;
            const device = await RegisteredDevice.findOne({
                auid,
                organization: effectiveOrgId,
                deletedAt: null
            });

            if (!device) return res.status(404).json({ message: 'Device not found' });

            // SOFT DELETE IMPLEMENTATION
            device.deletedAt = new Date();

            // Clear collaborators to prevent further access, but allow history
            // device.collaborators = []; 

            await device.save();

            // NOTE: We do NOT hard delete or pull from organization list to preserve history
            // await RegisteredDevice.deleteOne({ _id: device._id });
            // await Organization.updateOne({ organizationId: effectiveOrgId }, { $pull: { devices: auid } });

            res.status(200).json({ message: 'Device successfully deleted (archived)' });
        } catch (err) {
            res.status(500).json({ message: 'Server error', error: err.message });
        }
    }

    // RBAC Delete Device (Redundant but strict perms)
    async removeDevice(req, res) {
        try {
            const { orgId, auid } = req.params;
            // Strict check handled by checkOrgAccess in route
            const device = await RegisteredDevice.findOne({
                auid,
                organization: orgId,
                deletedAt: null
            });
            if (!device) return res.status(404).json({ message: 'Device not found' });

            // SOFT DELETE
            device.deletedAt = new Date();
            await device.save();

            res.status(200).json({ message: 'Device removed by org-admin' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    // Move Device
    async moveDevice(req, res) {
        try {
            const { orgId, auid } = req.params;
            const { fromDeploymentId, toDeploymentId } = req.body;

            if (!fromDeploymentId || !toDeploymentId) return res.status(400).json({ message: 'Missing deployment IDs' });

            const from = await Deployment.findOne({ deploymentid: fromDeploymentId, organizationId: orgId });
            const to = await Deployment.findOne({ deploymentid: toDeploymentId, organizationId: orgId });

            if (!from || !to) return res.status(404).json({ message: 'Deployments not found in org' });

            const device = await RegisteredDevice.findOne({ auid, organization: orgId });
            if (!device) return res.status(404).json({ message: 'Device not found in org' });

            from.devices = from.devices.filter(id => id !== auid);
            await from.save();

            to.devices.push(auid);
            await to.save();

            device.deployment = toDeploymentId;
            await device.save();

            res.status(200).json({ message: 'Device moved successfully', toDeploymentId });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
    // Transfer Device to Another Organization
    async transferDevice(req, res) {
        try {
            const { orgId, auid } = req.params;
            const { targetOrgId } = req.body;
            const userId = req.user.userid;

            if (!targetOrgId) return res.status(400).json({ message: 'Target organization ID is required' });

            // 1. Validate Source Org (Middleware checkOrgAccess 'org.devices.edit' handles permission)
            // But we must ensure device is actually in source org
            const device = await RegisteredDevice.findOne({
                auid,
                organization: orgId,
                deletedAt: null
            });
            if (!device) return res.status(404).json({ message: 'Device not found in source organization' });

            // 2. Validate Target Org Existence & Membership
            const targetOrg = await Organization.findOne({ organizationId: targetOrgId, deletedAt: null });
            if (!targetOrg) return res.status(404).json({ message: 'Target organization not found' });

            const targetMember = targetOrg.collaborators.find(c => c.userid === userId);
            if (!targetMember) {
                return res.status(403).json({ message: 'You must be a member of the target organization to transfer a device there.' });
            }

            // 3. Perform Transfer

            // A. Update Device Record
            device.organization = targetOrgId;
            device.organizationId = targetOrgId; // New field
            device.deployment = null; // Reset deployment
            device.deploymentId = null; // Reset deployment

            // Reset collaborators: Transferer becomes sole device-admin to ensure safety
            device.collaborators = [{
                userid: userId,
                role: 'device-admin',
                permissions: [],
                addedAt: new Date()
            }];

            await device.save();

            // B. Update Source Org (Pull)
            await Organization.updateOne(
                { organizationId: orgId },
                { $pull: { devices: auid } }
            );

            // C. Update Target Org (Push)
            await Organization.updateOne(
                { organizationId: targetOrgId },
                { $addToSet: { devices: auid } }
            );

            res.status(200).json({
                message: 'Device transferred successfully',
                device: {
                    auid: device.auid,
                    organizationId: targetOrgId
                }
            });

        } catch (err) {
            console.error("Transfer Error:", err);
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = new OrganizationDevicesController();
