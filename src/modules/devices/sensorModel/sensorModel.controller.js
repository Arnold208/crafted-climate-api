const sensorModelService = require('./sensorModel.service');

class SensorModelController {
    async createModel(req, res) {
        try {
            const { model, description, version } = req.body;
            if (!req.file || !model || !description) {
                return res.status(400).send({ message: "Model, description, and image are required." });
            }

            const newModel = await sensorModelService.createModel({
                model, description, version, file: req.file
            });

            return res.status(201).send({ message: `Model "${model}" created successfully with image.`, data: newModel });
        } catch (err) {
            if (err.message.includes('already exists')) return res.status(409).send({ message: err.message });
            return res.status(500).send({ message: "Failed to create model", error: err.message });
        }
    }

    async getAllModels(req, res) {
        try {
            const models = await sensorModelService.getAllModels();
            return res.status(200).send({ message: "Sensor models retrieved", data: models });
        } catch (err) {
            return res.status(500).send({ message: "Failed to retrieve models", error: err.message });
        }
    }

    async searchModels(req, res) {
        try {
            const { query, version } = req.query;
            const models = await sensorModelService.searchModels(query, version);
            return res.status(200).send({ message: "Filtered models retrieved", data: models });
        } catch (err) {
            return res.status(500).send({ message: "Search failed", error: err.message });
        }
    }

    async getModelByUuid(req, res) {
        try {
            const model = await sensorModelService.getModelByUuid(req.params.uuid);
            if (!model) return res.status(404).send({ message: "Model not found." });
            return res.status(200).send({ message: "Model retrieved by UUID", data: model });
        } catch (err) {
            return res.status(500).send({ message: "Fetch by UUID failed", error: err.message });
        }
    }

    async getModelByName(req, res) {
        try {
            const data = await sensorModelService.getModelByName(req.params.model);
            if (!data) return res.status(404).send({ message: `Model "${req.params.model}" not found.` });
            return res.status(200).send({ message: "Model retrieved successfully", data });
        } catch (err) {
            return res.status(500).send({ message: "Failed to retrieve model", error: err.message });
        }
    }

    async updateModel(req, res) {
        try {
            const { description } = req.body;
            const updated = await sensorModelService.updateModel(req.params.model, description, req.file);
            return res.status(200).send({ message: "Model updated successfully", data: updated });
        } catch (err) {
            if (err.message.includes('not found')) return res.status(404).send({ message: err.message });
            return res.status(500).send({ message: "Update failed", error: err.message });
        }
    }

    async deleteModel(req, res) {
        try {
            const deleted = await sensorModelService.deleteModel(req.params.model);
            if (!deleted) return res.status(404).send({ message: `Model "${req.params.model}" not found.` });
            return res.status(200).send({ message: `Model "${req.params.model}" deleted successfully.` });
        } catch (err) {
            return res.status(500).send({ message: "Delete failed", error: err.message });
        }
    }
}

module.exports = new SensorModelController();
