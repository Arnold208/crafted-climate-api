const Threshold = require('../../../models/threshold/threshold');
const Device = require('../../../models/devices/registerDevice');
const sensorMetadata = require('../../../utils/sensorMetadata');

class ThresholdService {
    async getThresholdById(id) {
        return await Threshold.findById(id);
    }

    async setStatus(id, enabled) {
        const threshold = await Threshold.findById(id);
        if (!threshold) throw new Error("Threshold not found");
        threshold.enabled = enabled;
        return await threshold.save();
    }

    async getMetadata(auid) {
        const device = await Device.findOne({ auid });
        if (!device) throw new Error("Device not found");

        const baseModel = device.model.split('-')[0].toUpperCase();
        const metadata = sensorMetadata[baseModel];

        if (!metadata) throw new Error(`No metadata found for model ${device.model}`);

        return { auid, model: baseModel, datapoints: metadata };
    }

    async getDeviceThresholds(auid) {
        return await Threshold.find({ deviceAuid: auid });
    }

    async createThreshold(auid, { datapoint, operator, min, max, alertChannels, cooldownMinutes }) {
        const device = await Device.findOne({ auid });
        if (!device) throw new Error("Device not found");

        const baseModel = device.model.split('-')[0].toUpperCase();
        const metadata = sensorMetadata[baseModel];
        if (!metadata) throw new Error(`No metadata available for ${device.model}`);

        if (!device.datapoints.includes(datapoint)) {
            throw new Error(`Device does not support datapoint "${datapoint}". Supported: ${device.datapoints.join(', ')}`);
        }

        const allowed = metadata[datapoint];
        if (!allowed) throw new Error(`Datapoint "${datapoint}" is not defined in metadata for model ${baseModel}`);

        // Operator Validation Logic
        switch (operator) {
            case '>':
            case '>=':
                if (min === undefined) throw new Error("min is required");
                if (min < allowed.min || min > allowed.max) throw new Error(`min must be ${allowed.min}-${allowed.max}`);
                max = null;
                break;
            case '<':
            case '<=':
                if (max === undefined) throw new Error("max is required");
                if (max < allowed.min || max > allowed.max) throw new Error(`max must be ${allowed.min}-${allowed.max}`);
                min = null;
                break;
            case 'between':
            case 'outside':
                if (min === undefined || max === undefined) throw new Error("Both min and max required");
                if (min >= max) throw new Error("min must be less than max");
                if (min < allowed.min || max > allowed.max) throw new Error(`Range must be ${allowed.min}-${allowed.max}`);
                break;
            default:
                throw new Error("Invalid operator");
        }

        return await Threshold.create({
            deviceAuid: auid,
            datapoint,
            operator,
            min,
            max,
            cooldownMinutes,
            alertChannels
        });
    }

    async updateThreshold(id, updates) {
        const threshold = await Threshold.findById(id);
        if (!threshold) throw new Error("Threshold not found");

        const device = await Device.findOne({ auid: threshold.deviceAuid });
        // Assuming allowed logic mirrors create
        // We need to fetch metadata again to validate ranges if min/max changed
        const baseModel = device.model.split('-')[0].toUpperCase();
        const metadata = sensorMetadata[baseModel];
        const allowed = metadata[updates.datapoint || threshold.datapoint];

        let operator = updates.operator || threshold.operator;
        let min = updates.min ?? threshold.min;
        let max = updates.max ?? threshold.max;

        switch (operator) {
            case '>':
            case '>=':
                if (min === undefined) throw new Error("min required");
                if (min < allowed.min || min > allowed.max) throw new Error(`min must be ${allowed.min}-${allowed.max}`);
                max = null;
                break;
            case '<':
            case '<=':
                if (max === undefined) throw new Error("max required");
                if (max < allowed.min || max > allowed.max) throw new Error(`max must be ${allowed.min}-${allowed.max}`);
                min = null;
                break;
            case 'between':
            case 'outside':
                if (min === undefined || max === undefined) throw new Error("min and max required");
                if (min >= max) throw new Error("min must be less than max");
                // Note: Logic allows updates even if out of metadata range? No, strict enforcement in legacy code.
                break;
        }

        threshold.datapoint = updates.datapoint ?? threshold.datapoint;
        threshold.operator = operator;
        threshold.min = min;
        threshold.max = max;
        threshold.cooldownMinutes = updates.cooldownMinutes ?? threshold.cooldownMinutes;
        threshold.alertChannels = updates.alertChannels ?? threshold.alertChannels;

        return await threshold.save();
    }

    async deleteThreshold(id) {
        return await Threshold.findByIdAndDelete(id);
    }

    async getParameters(auid) {
        const device = await Device.findOne({ auid });
        if (!device) throw new Error("Device not found");
        const baseModel = device.model.split('-')[0].toUpperCase();
        const metadata = sensorMetadata[baseModel];

        if (!metadata) throw new Error(`No metadata found for ${device.model}`);

        const labelMap = {
            temperature: "Temperature", humidity: "Humidity", pm1: "PM1", pm2_5: "PM2.5", pm10: "PM10",
            pressure: "Pressure", altitude: "Altitude", lux: "Light Intensity", uv: "UV Index",
            sound: "Sound Level", aqi: "Air Quality Index", battery: "Battery Level", eco2_ppm: "eCO₂",
            tvoc_ppb: "TVOC", current: "Current", voltage: "Voltage", ph: "pH Level",
            ec: "Electrical Conductivity", turbidity: "Turbidity", waterTemp: "Water Temperature",
            moisture: "Soil Moisture", npk_n: "Nitrogen (N)", npk_p: "Phosphorus (P)",
            npk_k: "Potassium (K)", soilTemp: "Soil Temperature"
        };

        const supported = device.datapoints.filter(dp => metadata[dp]);
        const thresholdOptions = supported.map(dp => ({
            datapoint: dp,
            label: labelMap[dp] || dp,
            min: metadata[dp].min,
            max: metadata[dp].max,
            operators: [">", "<", ">=", "<=", "between", "outside"]
        }));

        return { auid, model: baseModel, allowedDatapoints: supported, thresholdOptions };
    }
}

module.exports = new ThresholdService();
