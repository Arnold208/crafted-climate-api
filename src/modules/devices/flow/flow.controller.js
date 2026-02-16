const flowService = require('./flow.service');

class FlowController {
    async getDeviceConfig(req, res) {
        try {
            const config = await flowService.getDeviceConfig(req.params.auid);
            return res.status(200).send({ data: config });
        } catch (err) {
            return res.status(500).send({ message: "Failed to fetch config", error: err.message });
        }
    }

    async updatePump(req, res) {
        try {
            const { pump, mode } = req.body;
            const updated = await flowService.updatePumpState(req.params.auid, pump, mode);
            return res.status(200).send({ message: "Pump state updated", data: updated });
        } catch (err) {
            return res.status(500).send({ message: "Failed to update pump", error: err.message });
        }
    }

    async addSchedule(req, res) {
        try {
            const updated = await flowService.addSchedule(req.params.auid, req.body);
            return res.status(201).send({ message: "Schedule added", data: updated });
        } catch (err) {
            return res.status(500).send({ message: "Failed to add schedule", error: err.message });
        }
    }

    async updateSchedule(req, res) {
        try {
            const updated = await flowService.updateSchedule(req.params.auid, req.params.scheduleId, req.body);
            return res.status(200).send({ message: "Schedule updated", data: updated });
        } catch (err) {
            return res.status(500).send({ message: "Failed to update schedule", error: err.message });
        }
    }

    async deleteSchedule(req, res) {
        try {
            const updated = await flowService.deleteSchedule(req.params.auid, req.params.scheduleId);
            return res.status(200).send({ message: "Schedule deleted", data: updated });
        } catch (err) {
            return res.status(500).send({ message: "Failed to delete schedule", error: err.message });
        }
    }

    async syncConfig(req, res) {
        try {
            const devid = req.params.devid || req.query.devid;
            const syncData = await flowService.getSyncConfig(devid);
            if (!syncData) return res.status(404).send({ message: "Config not found" });
            return res.status(200).send(syncData);
        } catch (err) {
            return res.status(500).send({ message: "Sync failed", error: err.message });
        }
    }
}

module.exports = new FlowController();
