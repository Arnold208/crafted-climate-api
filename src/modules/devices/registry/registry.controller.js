const registryService = require('./registry.service');
const enforceDeviceLimit = require('../../../middleware/subscriptions/enforceDeviceLimit');
const { checkDeviceAccessCompatibility } = require('../../../middleware/devices/checkDeviceAccessCompatibility');
// checkDeviceAccessCompatibility signature: (req, resource, action) -> boolean

class RegistryController {
    async registerDevice(req, res) {
        try {
            const { auid, serial, location, nickname } = req.body;
            const userid = req.user.userid;
            const organizationId = req.query.orgId;

            if (!organizationId) return res.status(400).json({ message: "organizationId (orgId) is required in query param" });

            // Note: Limit enforcement is now handled inside registryService.registerDevice
            // to ensure atomic check with organization context.
            // await enforceDeviceLimit(userid); <--- REMOVED

            const newDevice = await registryService.registerDevice({
                auid, serial, location, nickname, userid, organizationId
            });

            return res.status(201).json(newDevice);

        } catch (error) {
            if (error.message.includes('already registered')) return res.status(409).json({ message: error.message });
            if (error.message.includes('not found')) return res.status(404).json({ message: error.message });
            return res.status(500).json({ error: error.message });
        }
    }

    async getUserDevices(req, res) {
        try {
            const { userid } = req.params;
            const organizationId = req.query.orgId;

            let devices = [];

            if (organizationId) {
                // ORGANIZATION CONTEXT
                // Verify the user is actually a member of this org with sufficient permissions
                // Note: In an ideal world, middleware handles this. For now, manual check or rely on robust reusable helper.

                // For safety, only allow if the requesting user matches the param ID (or is super admin)
                if (req.user.userid !== userid) return res.status(403).json({ message: "ID mismatch" });

                // We need to fetch devices for the ENTIRE organization if the user is an Admin
                // OR just return the devices they have access to?
                // User requirement: "Org admins... can also see the online devices" imply ALL devices.

                // Check Org Membership & Role
                devices = await registryService.getOrganizationDevices(organizationId);

                // FILTER: Only show what this user is effectively allowed to see based on Org Role
                // If Org Admin -> All. If Member -> Maybe only assigned? 
                // For now, returning ALL for the Org context, filtering purely by explicit device permissions 
                // might exclude unassigned devices that the Admin SHOULD see.

                // Assuming here: If you passed checkOrgAccess('view_devices'), you see them ALL.
            } else {
                // PERSONAL CONTEXT (Legacy / Existing)
                devices = await registryService.getUserDevices(userid);
            }

            const accessible = [];
            for (const d of devices) {
                // If it's Org Context, we might want to skip per-device check if user is Org Admin?
                // But strict RBAC is safer. 
                if (await checkDeviceAccessCompatibility(req, d, 'view')) {
                    accessible.push(d);
                }
            }
            res.json(accessible);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getDeviceByAuid(req, res) {
        try {
            const device = await registryService.getDeviceByAuid(req.params.auid);
            if (!device) return res.status(404).json({ message: 'Device not found' });

            if (!await checkDeviceAccessCompatibility(req, device, 'view')) {
                return res.status(403).json({ message: 'Forbidden' });
            }
            res.status(200).json(device);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async deleteDevice(req, res) {
        try {
            const { auid } = req.params;
            const device = await registryService.getDeviceByAuid(auid);
            if (!device) return res.status(404).json({ message: 'Device registration not found' });

            if (!await checkDeviceAccessCompatibility(req, device, 'delete')) {
                return res.status(403).json({ message: 'Forbidden' });
            }

            const result = await registryService.deleteDevice(auid);
            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getLocation(req, res) {
        try {
            const devices = await registryService.getUserDevices(req.params.userid);
            if (!devices.length) return res.status(404).json({ message: 'No devices found' });

            const results = [];
            for (const d of devices) {
                if (await checkDeviceAccessCompatibility(req, d, 'view')) {
                    results.push({
                        auid: d.auid, location: d.location, status: d.status, battery: d.battery
                    });
                }
            }
            if (!results.length) return res.status(404).json({ message: 'No devices found' });
            res.json(results);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getSpecificLocation(req, res) {
        try {
            const device = await registryService.getDeviceByAuid(req.params.auid);
            if (!device) return res.status(404).json({ message: 'Device not found' }); // Assuming userid check handled by access control

            if (!await checkDeviceAccessCompatibility(req, device, 'view')) {
                return res.status(403).json({ message: 'Forbidden' });
            }

            res.json({
                auid: device.auid, location: device.location, status: device.status, battery: device.battery
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async updateDevice(req, res) {
        try {
            const { auid } = req.params;
            const device = await registryService.getDeviceByAuid(auid);
            if (!device) return res.status(404).json({ message: 'Device not found' });

            if (!await checkDeviceAccessCompatibility(req, device, 'edit')) {
                return res.status(403).json({ message: 'Forbidden' });
            }

            const updated = await registryService.updateDevice(req.params.userid, auid, req.body);
            res.json({ message: 'Device updated', device: updated });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async addCollaborator(req, res) {
        try {
            const { auid } = req.params;
            const { email, role, permissions } = req.body;

            const device = await registryService.getDeviceByAuid(auid);
            if (!device) return res.status(404).json({ message: 'Device not found' });

            if (!await checkDeviceAccessCompatibility(req, device, 'share')) {
                return res.status(403).json({ message: 'Forbidden' });
            }

            const collaborators = await registryService.addCollaborator(auid, email, role, permissions);
            res.json({ message: 'Collaborator added', collaborators });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // ... Implement remaining methods similarly ...
    async removeCollaborator(req, res) {
        try {
            const { auid } = req.params;
            const device = await registryService.getDeviceByAuid(auid);
            if (!device) return res.status(404).json({ message: 'Device not found' });

            if (!await checkDeviceAccessCompatibility(req, device, 'share')) {
                return res.status(403).json({ message: 'Forbidden' });
            }
            const collaborators = await registryService.removeCollaborator(auid, req.body.email);
            res.json({ message: 'Collaborator removed', collaborators });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async setAvailability(req, res) {
        try {
            const { auid } = req.params;
            const { availability } = req.body;
            if (!['public', 'private'].includes(availability)) return res.status(400).json({ message: 'Invalid availability' });

            const device = await registryService.getDeviceByAuid(auid);
            if (!device) return res.status(404).json({ message: 'Device not found' });

            if (!await checkDeviceAccessCompatibility(req, device, 'edit')) {
                return res.status(403).json({ message: 'Forbidden' });
            }

            const updated = await registryService.setAvailability(auid, availability);
            res.json({ message: `Availability set to ${availability}`, device: updated });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }
}

module.exports = new RegistryController();
