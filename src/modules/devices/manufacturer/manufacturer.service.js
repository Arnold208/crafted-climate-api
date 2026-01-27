const AddDevice = require('../../../models/devices/addDevice');
const SensorModel = require('../../../models/devices/deviceModels');
const registerNewDevice = require('../../../models/devices/registerDevice');
const {
    generateManufacturerId,
    generateSku,
    generateBatchNumber,
    generateSerialNumber,
    generateAUID,
} = require('../../../utils/idGenerator');

class ManufacturerService {
    async createDevice({ devid, model, type, mac, datapoints, noteDevUuid }) {
        // 1. Validate Model Exists
        const sensorModel = await SensorModel.findOne({ model: model.toLowerCase() });
        if (!sensorModel) {
            throw new Error(`Model "${model}" not found in device models`);
        }

        // 2. Check Duplicates
        const existingDevice = await AddDevice.findOne({
            $or: [{ devid }, { mac }, { noteDevUuid }]
        });

        if (existingDevice) {
            if (existingDevice.devid === devid) throw new Error('Device with this devid already exists');
            if (existingDevice.mac === mac) throw new Error('Device with this MAC address already exists');
            if (existingDevice.noteDevUuid === noteDevUuid) throw new Error('Device with this noteDevUuid already exists');
            throw new Error('A device with this unique identifier already exists');
        }

        // 3. Generate IDs
        const manufacturingId = generateManufacturerId();
        const sku = generateSku(model);
        const batchNumber = await generateBatchNumber();
        const auid = generateAUID();
        const serial = generateSerialNumber();

        // 4. Create Device
        const newDevice = new AddDevice({
            devid,
            model: model.toLowerCase(),
            type,
            mac,
            manufacturingId,
            sku,
            batchNumber,
            status: 'MANUFACTURED',
            datapoints,
            auid,
            serial
        });

        return await newDevice.save();
    }

    async updateNoteUuid(serial, newNoteDevUuid) {
        // 1. Check if UUID in use by OTHER device
        const existingDevice = await AddDevice.findOne({
            noteDevUuid: newNoteDevUuid,
            serial: { $ne: serial },
        });
        if (existingDevice) throw new Error('This noteDevUuid is already in use by another device');

        // 2. Update Manufacturer Record
        const updatedAddDevice = await AddDevice.findOneAndUpdate(
            { serial },
            { $set: { noteDevUuid: newNoteDevUuid } },
            { new: true }
        );
        if (!updatedAddDevice) throw new Error('Device not found in manufacturer records');

        // 3. Update Registered Device Record (Sync)
        await registerNewDevice.findOneAndUpdate(
            { serial },
            { $set: { noteDevUuid: newNoteDevUuid } },
            { new: true }
        );

        return updatedAddDevice;
    }

    async getAllDevices() {
        return await AddDevice.find();
    }

    async getDeviceById(manufacturingId) {
        return await AddDevice.findOne({ manufacturingId });
    }

    async updateDevice(manufacturingId, updates) {
        return await AddDevice.findOneAndUpdate(
            { manufacturingId },
            updates,
            { new: true }
        );
    }

    async deleteDevice(manufacturingId) {
        return await AddDevice.findOneAndDelete({ manufacturingId });
    }
}

module.exports = new ManufacturerService();
