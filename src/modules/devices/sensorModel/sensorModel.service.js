const SensorModel = require('../../../models/devices/deviceModels');
const { containerClient, generateSignedUrl } = require('../../../config/storage/storage');

class SensorModelService {
    async createModel({ model, description, version, file, datapoints, imageUrl }) {
        const existing = await SensorModel.findOne({ model: model.toLowerCase() });
        if (existing) throw new Error(`Model "${model}" already exists.`);

        let signedUrl = imageUrl || '';
        if (file) {
            const fileName = `upload-${Date.now()}-${file.originalname}`;
            const blockBlobClient = containerClient.getBlockBlobClient(fileName);
            await blockBlobClient.upload(file.buffer, file.size, {
                blobHTTPHeaders: { blobContentType: file.mimetype },
            });
            signedUrl = generateSignedUrl(fileName);
        }

        const newModel = new SensorModel({
            model: model.toLowerCase(),
            description,
            version: parseFloat(version) || 1.0,
            imageUrl: signedUrl,
            datapoints: datapoints || [],
        });

        return await newModel.save();
    }

    async getAllModels() {
        return await SensorModel.find();
    }

    async searchModels(query, version) {
        const filter = {};
        if (query) {
            filter.$or = [
                { model: { $regex: query, $options: "i" } },
                { description: { $regex: query, $options: "i" } },
            ];
        }
        if (version) {
            filter.version = parseFloat(version);
        }
        return await SensorModel.find(filter);
    }

    async getModelByUuid(uuid) {
        return await SensorModel.findOne({ uuid });
    }

    async getModelByName(modelName) {
        return await SensorModel.findOne({ model: modelName.toLowerCase() });
    }

    async updateModel(modelName, description, file, datapoints, imageUrl) {
        const existing = await SensorModel.findOne({ model: modelName.toLowerCase() });
        if (!existing) throw new Error(`Model "${modelName}" not found.`);

        let signedUrl = imageUrl || existing.imageUrl;
        if (file) {
            const fileName = `upload-${Date.now()}-${file.originalname}`;
            const blockBlobClient = containerClient.getBlockBlobClient(fileName);
            await blockBlobClient.upload(file.buffer, file.size, {
                blobHTTPHeaders: { blobContentType: file.mimetype },
            });
            signedUrl = generateSignedUrl(fileName);
        }

        existing.description = description || existing.description;
        existing.imageUrl = signedUrl;
        if (datapoints !== undefined) {
            existing.datapoints = datapoints;
        }
        existing.updatedAt = Date.now();

        return await existing.save();
    }

    async deleteModel(modelName) {
        return await SensorModel.findOneAndDelete({ model: modelName.toLowerCase() });
    }
    async backfillDefaultDatapoints() {
        const DEFAULT_MODEL_DATAPOINTS = {
            env: ['temperature', 'humidity', 'pm1', 'pm2_5', 'pm10', 'pressure', 'altitude', 'lux', 'uv', 'sound', 'aqi'],
            aqua: ['ph', 'ec', 'turbidity', 'waterTemp'],
            gas: ['eco2_ppm', 'tvoc_ppb', 'temperature', 'humidity', 'pressure', 'aqi', 'current', 'voltage'],
            'gas-solo': ['eco2_ppm', 'tvoc_ppb', 'temperature', 'humidity', 'pressure', 'aqi', 'current', 'voltage'],
            terra: ['moisture', 'npk_n', 'npk_p', 'npk_k', 'soilTemp'],
            flow: ['pump', 'manual', 'op_mode', 'tank_full', 'tank_empty', 'tank_mm', 'tank_l', 'health']
        };

        for (const [modelName, dps] of Object.entries(DEFAULT_MODEL_DATAPOINTS)) {
            await SensorModel.updateOne(
                { model: modelName, $or: [{ datapoints: { $exists: false } }, { datapoints: { $size: 0 } }] },
                { $set: { datapoints: dps } }
            );
        }
    }
}

const service = new SensorModelService();
service.backfillDefaultDatapoints().catch(err => console.error("Failed to backfill default datapoints:", err));

module.exports = service;
