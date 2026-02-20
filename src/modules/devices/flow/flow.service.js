const FlowConfig = require('../../../models/devices/flowConfig');
const registerNewDevice = require('../../../models/devices/registerDevice');

class FlowService {
    async _getConfigDoc(auid) {
        const device = await registerNewDevice.findOne({ auid });
        if (!device) throw new Error("Device not found");

        let config = await FlowConfig.findOne({ auid });
        if (!config) {
            config = new FlowConfig({
                auid: device.auid,
                devid: device.devid,
                desiredState: { pump: false, op_mode: "schedule" },
                schedules: []
            });
            await config.save();
        }
        return config;
    }

    async getDeviceConfig(auid) {
        const device = await registerNewDevice.findOne({ auid });
        if (!device) throw new Error("Device not found");

        const config = await this._getConfigDoc(auid);

        // Return a combined object (Mongoose toObject + specialized metadata)
        const configObj = config.toObject();
        configObj.power_system = device.power_system || {};
        configObj.setup = device.setup || {};

        return configObj;
    }

    async updatePumpState(auid, pump, op_mode) {
        const config = await this._getConfigDoc(auid);
        const { sendCommandToAUID } = require('../../../config/socket/socketio');

        const command = {};
        if (pump !== undefined) {
            config.desiredState.pump = pump;
            command.pump = pump;
        }
        if (op_mode) {
            config.desiredState.op_mode = op_mode;
            command.op_mode = op_mode;
        }

        // Only send what was explicitly changed in this request
        if (Object.keys(command).length > 0) {
            sendCommandToAUID(auid, command);
        }

        config.lastUpdated = Date.now();
        return await config.save();
    }

    async updateOpMode(auid, op_mode) {
        const config = await this._getConfigDoc(auid);
        const { sendCommandToAUID } = require('../../../config/socket/socketio');

        config.desiredState.op_mode = op_mode;
        config.lastUpdated = Date.now();

        // Only send op_mode as requested
        sendCommandToAUID(auid, { op_mode });

        return await config.save();
    }

    async addSchedule(auid, scheduleData) {
        const config = await this._getConfigDoc(auid);
        config.schedules.push(scheduleData);
        config.lastUpdated = Date.now();
        return await config.save();
    }

    async updateSchedule(auid, scheduleId, scheduleData) {
        const config = await this._getConfigDoc(auid);
        const index = config.schedules.findIndex(s => s.id === scheduleId);
        if (index === -1) throw new Error("Schedule not found");

        config.schedules[index] = { ...config.schedules[index].toObject(), ...scheduleData, id: scheduleId };
        config.lastUpdated = Date.now();
        return await config.save();
    }

    async deleteSchedule(auid, scheduleId) {
        const config = await this._getConfigDoc(auid);
        config.schedules = config.schedules.filter(s => s.id !== scheduleId);
        config.lastUpdated = Date.now();
        return await config.save();
    }

    async getSyncConfig(auid) {
        const config = await FlowConfig.findOne({ auid });
        if (!config) return null;

        return {
            p: config.desiredState.pump,
            om: config.desiredState.op_mode,
            schedules: config.schedules.filter(s => s.enabled).map(s => ({
                id: s.id,
                st: s.startTime,
                du: s.durationMinutes,
                in: s.intervalMinutes || 0,
                days: s.days
            }))
        };
    }

    async updateDeviceSetup(auid, reqBody) {
        const registryService = require('../registry/registry.service');
        return await registryService.updateDevice(null, auid, reqBody);
    }
}

module.exports = new FlowService();
