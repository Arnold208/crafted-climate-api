const otaService = require('./ota.service');

class OTAController {
    async uploadFirmware(req, res) {
        try {
            const { firmware_version, hardware_version, model, author } = req.body;
            const newFirmware = await otaService.uploadFirmware({
                firmware_version, hardware_version, model, author, file: req.file
            });

            res.status(201).json({
                message: "Firmware uploaded successfully",
                firmware_url: newFirmware.firmware_url,
                firmware_version,
                hardware_version
            });
        } catch (error) {
            if (error.message.includes("allowed") || error.message.includes("exist")) {
                return res.status(400).json({ error: error.message });
            }
            console.error("Upload error:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    }

    async getLatestUpdate(req, res) {
        try {
            const { firmware_version, hardware_version, model } = req.query;
            if (!firmware_version || !hardware_version || !model) {
                return res.status(400).json({ message: "Please provide firmware_version, hardware_version, and model." });
            }

            const update = await otaService.getLatestUpdate(firmware_version, hardware_version, model);
            if (!update) {
                return res.status(404).json({ message: "No update found for the specified device." });
            }

            res.status(200).json({
                firmware_url: update.firmware_url,
                firmware_version: update.firmware_version,
                hardware_version: update.hardware_version,
                model: update.model,
                createdAt: update.createdAt
            });
        } catch (error) {
            console.error("Error checking latest update:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    }

    async listFirmware(req, res) {
        try {
            const list = await otaService.listFirmware();
            res.status(200).json(list);
        } catch (error) {
            console.error("Error fetching firmware list:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    }

    async deleteFirmware(req, res) {
        try {
            const deleted = await otaService.deleteFirmware(req.params.uuid);
            if (!deleted) return res.status(404).json({ error: "Firmware not found" });
            res.status(200).json({ message: "Firmware deleted successfully" });
        } catch (error) {
            console.error("Error deleting firmware:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    }
}

module.exports = new OTAController();
