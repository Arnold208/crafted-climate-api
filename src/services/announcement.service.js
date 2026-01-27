const Announcement = require('../models/admin/Announcement');
const { v4: uuidv4 } = require('uuid');
const { createAuditLog } = require('../utils/auditLogger');

/**
 * Announcement Service
 * Manage platform announcements
 */
class AnnouncementService {

    /**
     * Create announcement
     */
    async createAnnouncement(data, adminId) {
        const { title, message, type, priority, targetAudience, startDate, endDate } = data;

        const announcement = new Announcement({
            announcementId: uuidv4(),
            title,
            message,
            type,
            priority,
            targetAudience,
            startDate: startDate || new Date(),
            endDate,
            createdBy: adminId
        });

        await announcement.save();

        // Audit log
        await createAuditLog({
            action: 'ADMIN_CREATE_ANNOUNCEMENT',
            userid: adminId,
            details: { announcementId: announcement.announcementId, title },
            ipAddress: null
        });

        return announcement;
    }

    /**
     * List announcements
     */
    async listAnnouncements(filters = {}) {
        const { active, type, targetAudience } = filters;

        const query = {};

        if (active !== undefined) {
            query.active = active;
        }

        if (type) {
            query.type = type;
        }

        if (targetAudience) {
            query.targetAudience = targetAudience;
        }

        const announcements = await Announcement.find(query)
            .sort({ priority: -1, createdAt: -1 })
            .lean();

        return announcements;
    }

    /**
     * Get active announcements (for users)
     */
    async getActiveAnnouncements(targetAudience = 'all') {
        const now = new Date();

        const announcements = await Announcement.find({
            active: true,
            startDate: { $lte: now },
            $or: [
                { endDate: { $gte: now } },
                { endDate: null }
            ],
            $or: [
                { targetAudience: 'all' },
                { targetAudience }
            ]
        }).sort({ priority: -1, createdAt: -1 }).lean();

        return announcements;
    }

    /**
     * Delete announcement
     */
    async deleteAnnouncement(announcementId, adminId) {
        const announcement = await Announcement.findOne({ announcementId });

        if (!announcement) {
            throw new Error('Announcement not found');
        }

        await Announcement.deleteOne({ announcementId });

        // Audit log
        await createAuditLog({
            action: 'ADMIN_DELETE_ANNOUNCEMENT',
            userid: adminId,
            details: { announcementId, title: announcement.title },
            ipAddress: null
        });

        return { success: true, message: 'Announcement deleted' };
    }

    /**
     * Update announcement
     */
    async updateAnnouncement(announcementId, updates, adminId) {
        const announcement = await Announcement.findOne({ announcementId });

        if (!announcement) {
            throw new Error('Announcement not found');
        }

        Object.keys(updates).forEach(key => {
            if (announcement[key] !== undefined) {
                announcement[key] = updates[key];
            }
        });

        await announcement.save();

        // Audit log
        await createAuditLog({
            action: 'ADMIN_UPDATE_ANNOUNCEMENT',
            userid: adminId,
            details: { announcementId, updates },
            ipAddress: null
        });

        return announcement;
    }
}

module.exports = new AnnouncementService();
