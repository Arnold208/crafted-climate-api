const thresholdService = require('./threshold.service');

class ThresholdController {
    async setStatus(req, res) {
        try {
            const { id } = req.params;
            const { enabled } = req.body;
            if (enabled === undefined) return res.status(400).json({ message: "enabled (true/false) is required" });

            const threshold = await thresholdService.setStatus(id, enabled);
            return res.status(200).json({ message: `Threshold ${enabled ? "enabled" : "disabled"} successfully`, threshold });
        } catch (err) {
            if (err.message.includes('not found')) return res.status(404).json({ message: err.message });
            return res.status(500).json({ message: err.message });
        }
    }

    async getMetadata(req, res) {
        try {
            const result = await thresholdService.getMetadata(req.params.auid);
            return res.status(200).json(result);
        } catch (err) {
            if (err.message.includes('not found')) return res.status(404).json({ message: err.message });
            return res.status(500).json({ message: err.message });
        }
    }

    async getDeviceThresholds(req, res) {
        try {
            const thresholds = await thresholdService.getDeviceThresholds(req.params.auid);
            return res.status(200).json(thresholds);
        } catch (err) {
            return res.status(500).json({ message: err.message });
        }
    }

    async createThreshold(req, res) {
        try {
            const threshold = await thresholdService.createThreshold(req.params.auid, req.body);
            return res.status(200).json({ message: "Threshold created successfully", threshold });
        } catch (err) {
            if (err.message.includes('not found')) return res.status(404).json({ message: err.message });
            if (err.message.includes('required') || err.message.includes('Invalid') || err.message.includes('must be')) {
                return res.status(400).json({ message: err.message });
            }
            return res.status(500).json({ message: err.message });
        }
    }

    async updateThreshold(req, res) {
        try {
            const threshold = await thresholdService.updateThreshold(req.params.id, req.body);
            return res.status(200).json({ message: "Threshold updated successfully", threshold });
        } catch (err) {
            if (err.message.includes('not found')) return res.status(404).json({ message: err.message });
            if (err.message.includes('required') || err.message.includes('must be')) {
                return res.status(400).json({ message: err.message });
            }
            return res.status(500).json({ message: err.message });
        }
    }

    async deleteThreshold(req, res) {
        try {
            const removed = await thresholdService.deleteThreshold(req.params.id);
            if (!removed) return res.status(404).json({ message: "Threshold not found" });
            return res.status(200).json({ message: "Threshold deleted successfully" });
        } catch (err) {
            return res.status(500).json({ message: err.message });
        }
    }

    async getParameters(req, res) {
        try {
            const result = await thresholdService.getParameters(req.params.auid);
            return res.status(200).json(result);
        } catch (err) {
            if (err.message.includes('not found')) return res.status(404).json({ message: err.message });
            return res.status(500).json({ message: err.message });
        }
    }
}

module.exports = new ThresholdController();
