const manufacturerService = require('./manufacturer.service');

class ManufacturerController {
    async createDevice(req, res) {
        try {
            const { devid, model, type, mac, datapoints, noteDevUuid } = req.body;
            if (!devid || !model || !type || !mac) {
                return res.status(400).json({ error: 'All fields are required' });
            }

            const device = await manufacturerService.createDevice({ devid, model, type, mac, datapoints, noteDevUuid });
            return res.status(201).json({ message: 'Device manufactured successfully', device });

        } catch (error) {
            console.error('[Manufacturer] Create Error:', error);
            if (error.message.includes('already exists')) return res.status(409).json({ message: error.message });
            if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
            return res.status(500).json({ error: error.message });
        }
    }

    async updateNoteUuid(req, res) {
        try {
            const { serial, newNoteDevUuid } = req.body;
            if (!serial || !newNoteDevUuid) return res.status(400).json({ message: 'Both serial and newNoteDevUuid are required.' });

            const device = await manufacturerService.updateNoteUuid(serial, newNoteDevUuid);
            return res.status(200).json({ message: 'Device updated successfully', device });

        } catch (error) {
            if (error.message.includes('in use')) return res.status(409).json({ message: error.message });
            if (error.message.includes('not found')) return res.status(404).json({ message: error.message });
            return res.status(500).json({ message: 'Error updating device', error: error.message });
        }
    }

    async getAllDevices(req, res) {
        try {
            const devices = await manufacturerService.getAllDevices();
            return res.json(devices);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async getDeviceById(req, res) {
        try {
            const device = await manufacturerService.getDeviceById(req.params.id);
            if (!device) return res.status(404).json({ error: 'Device not found' });
            return res.json(device);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async updateDevice(req, res) {
        try {
            const updated = await manufacturerService.updateDevice(req.params.id, req.body);
            if (!updated) return res.status(404).json({ error: 'Device not found' });
            return res.json({ message: 'Device updated', device: updated });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async deleteDevice(req, res) {
        try {
            const deleted = await manufacturerService.deleteDevice(req.params.id);
            if (!deleted) return res.status(404).json({ error: 'Device not found' });
            return res.json({ message: 'Device deleted', device: deleted });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new ManufacturerController();
