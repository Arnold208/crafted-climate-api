const FlowConfig = require('../../../models/devices/flowConfig');
const registerNewDevice = require('../../../models/devices/registerDevice');

class FlowService {
    async getDeviceConfig(auid) {
        let config = await FlowConfig.findOne({ auid });
        if (!config) {
            const device = await registerNewDevice.findOne({ auid });
            if (!device) throw new Error("Device not found");

            config = new FlowConfig({
                auid: device.auid,
                devid: device.devid,
                desiredState: { pump: false, mode: "AUTO" },
                schedules: []
            });
            await config.save();
        }
        return config;
    }

    async updatePumpState(auid, pump, mode) {
        const config = await this.getDeviceConfig(auid);
        if (pump !== undefined) config.desiredState.pump = pump;
        if (mode) config.desiredState.mode = mode;
        config.lastUpdated = Date.now();
        return await config.save();
    }

    async addSchedule(auid, scheduleData) {
        const config = await this.getDeviceConfig(auid);
        config.schedules.push(scheduleData);
        config.lastUpdated = Date.now();
        return await config.save();
    }

    async updateSchedule(auid, scheduleId, scheduleData) {
        const config = await this.getDeviceConfig(auid);
        const index = config.schedules.findIndex(s => s.id === scheduleId);
        if (index === -1) throw new Error("Schedule not found");

        config.schedules[index] = { ...config.schedules[index].toObject(), ...scheduleData, id: scheduleId };
        config.lastUpdated = Date.now();
        return await config.save();
    }

    async deleteSchedule(auid, scheduleId) {
        const config = await this.getDeviceConfig(auid);
        config.schedules = config.schedules.filter(s => s.id !== scheduleId);
        config.lastUpdated = Date.now();
        return await config.save();
    }

    async getSyncConfig(devid) {
        const config = await FlowConfig.findOne({ devid });
        if (!config) return null;

        return {
            p: config.desiredState.pump,
            m: config.desiredState.mode,
            schedules: config.schedules.filter(s => s.enabled).map(s => ({
                id: s.id,
                st: s.startTime,
                du: s.durationMinutes,
                days: s.days
            }))
        };
    }
}

module.exports = new FlowService();
