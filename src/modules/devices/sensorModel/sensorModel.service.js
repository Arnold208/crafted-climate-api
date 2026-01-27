const SensorModel = require('../../../models/devices/deviceModels');
const { containerClient, generateSignedUrl } = require('../../../config/storage/storage');

class SensorModelService {
    async createModel({ model, description, version, file }) {
        const existing = await SensorModel.findOne({ model: model.toLowerCase() });
        if (existing) throw new Error(`Model "${model}" already exists.`);

        let signedUrl = '';
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

    async updateModel(modelName, description, file) {
        const existing = await SensorModel.findOne({ model: modelName.toLowerCase() });
        if (!existing) throw new Error(`Model "${modelName}" not found.`);

        let signedUrl = existing.imageUrl;
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
        existing.updatedAt = Date.now();

        return await existing.save();
    }

    async deleteModel(modelName) {
        return await SensorModel.findOneAndDelete({ model: modelName.toLowerCase() });
    }
}

module.exports = new SensorModelService();
