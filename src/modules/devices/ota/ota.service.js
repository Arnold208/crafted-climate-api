const OTAUpdate = require('../../../models/ota/otaModel');
const SensorModel = require('../../../models/devices/deviceModels');
const { generateFirmwareId } = require('../../../utils/idGenerator');
const { containerClient, generateSignedUrl } = require('../../../config/storage/storage');

class OTAService {
    async uploadFirmware({ firmware_version, hardware_version, model, author, file }) {
        if (!file || !file.originalname.endsWith(".bin")) {
            throw new Error("Only .bin firmware files are allowed.");
        }

        const modelExists = await SensorModel.findOne({ model: model.toLowerCase() });
        if (!modelExists) throw new Error("Sensor model does not exist. Please register the model first.");

        const versionExists = await OTAUpdate.findOne({ model, firmware_version });
        if (versionExists) throw new Error("Firmware version already exists for this model.");

        const uuid = generateFirmwareId();
        const blobName = `firmware/${uuid}.bin`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        await blockBlobClient.uploadData(file.buffer, {
            blobHTTPHeaders: { blobContentType: file.mimetype || "application/octet-stream" }
        });

        const signedUrl = generateSignedUrl(blobName);

        const newFirmware = new OTAUpdate({
            uuid,
            firmware_version,
            hardware_version,
            model,
            firmware_url: signedUrl,
            author
        });

        await newFirmware.save();
        return newFirmware;
    }

    async getLatestUpdate(firmware_version, hardware_version, model) {
        const candidates = await OTAUpdate.find({
            model,
            firmware_version: { $gt: firmware_version },
            hardware_version: { $gte: hardware_version }
        });

        if (!candidates || candidates.length === 0) return null;

        return candidates.reduce((latest, current) =>
            new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest, candidates[0]
        );
    }

    async listFirmware() {
        return await OTAUpdate.find();
    }

    async deleteFirmware(uuid) {
        return await OTAUpdate.findOneAndDelete({ uuid });
    }
}

module.exports = new OTAService();
