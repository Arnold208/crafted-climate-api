const RegisterDevice = require('../models/devices/registerDevice');
const { createAuditLog } = require('../utils/auditLogger');

/**
 * Admin Device Service
 * Platform admin operations for device management
 */
class AdminDeviceService {

    /**
     * List all devices across platform
     */
    async listAllDevices(filters = {}, pagination = {}) {
        const {
            search,
            organizationId,
            status,
            type
        } = filters;

        const {
            page = 1,
            limit = 50
        } = pagination;

        const skip = (page - 1) * limit;

        const query = { deletedAt: null };

        if (search) {
            query.$or = [
                { devid: { $regex: search, $options: 'i' } },
                { serial: { $regex: search, $options: 'i' } },
                { nickname: { $regex: search, $options: 'i' } }
            ];
        }

        if (organizationId) {
            query.organizationId = organizationId;
        }

        if (status) {
            query.status = status;
        }

        if (type) {
            query.type = type;
        }

        const [devices, total] = await Promise.all([
            RegisterDevice.find(query)
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 })
                .lean(),
            RegisterDevice.countDocuments(query)
        ]);

        return {
            devices,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Get device statistics
     */
    async getDeviceStatistics() {
        const { client: redis } = require('../config/redis/redis');

        // 1. Calculate Online Cutoff (30 mins)
        const now = Date.now();
        const cutoff = now - (30 * 60 * 1000);

        const [
            total,
            online,
            byType
        ] = await Promise.all([
            RegisterDevice.countDocuments({ deletedAt: null }),
            // High-performance real-time query for ONLINE devices
            redis.zCount('devices:heartbeat', cutoff, '+inf'),
            RegisterDevice.aggregate([
                { $match: { deletedAt: null } },
                { $group: { _id: '$type', count: { $sum: 1 } } }
            ])
        ]);

        const offline = total - online;

        const typeBreakdown = {};
        byType.forEach(item => {
            typeBreakdown[item._id] = item.count;
        });

        return {
            total,
            online,
            offline,
            typeBreakdown,
            lastCalculated: new Date().toISOString()
        };
    }

    /**
     * Remove device (hard delete)
     */
    async removeDevice(deviceId, adminId) {
        const device = await RegisterDevice.findOne({ devid: deviceId });
        if (!device) {
            throw new Error('Device not found');
        }

        const deviceData = {
            devid: device.devid,
            serial: device.serial,
            organizationId: device.organizationId
        };

        await RegisterDevice.deleteOne({ devid: deviceId });

        // Audit log
        await createAuditLog({
            action: 'ADMIN_DELETE_DEVICE',
            userid: adminId,
            details: deviceData,
            ipAddress: null
        });

        return {
            success: true,
            message: 'Device deleted successfully'
        };
    }

    /**
     * Get offline devices
     */
    async getOfflineDevices(thresholdHours = 24) {
        const thresholdDate = new Date();
        thresholdDate.setHours(thresholdDate.getHours() - thresholdHours);

        const devices = await RegisterDevice.find({
            status: 'offline',
            deletedAt: null,
            createdAt: { $lte: thresholdDate }
        }).lean();

        return {
            devices,
            count: devices.length,
            thresholdHours
        };
    }

    /**
     * Reassign device to different organization
     */
    async reassignDevice(deviceId, newOrgId, adminId) {
        const device = await RegisterDevice.findOne({ devid: deviceId });
        if (!device) {
            throw new Error('Device not found');
        }

        const oldOrgId = device.organizationId;
        device.organizationId = newOrgId;
        await device.save();

        // Audit log
        await createAuditLog({
            action: 'ADMIN_REASSIGN_DEVICE',
            userid: adminId,
            details: {
                deviceId,
                oldOrgId,
                newOrgId
            },
            ipAddress: null
        });

        return {
            success: true,
            message: 'Device reassigned successfully',
            device
        };
    }
}

module.exports = new AdminDeviceService();
