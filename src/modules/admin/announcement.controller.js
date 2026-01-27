const announcementService = require('../../services/announcement.service');

class AnnouncementController {

    async createAnnouncement(req, res) {
        try {
            const adminId = req.user.userid;
            const announcement = await announcementService.createAnnouncement(req.body, adminId);

            res.status(201).json({
                success: true,
                message: 'Announcement created successfully',
                data: announcement
            });
        } catch (error) {
            console.error('[AnnouncementController] Create error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    async listAnnouncements(req, res) {
        try {
            const filters = {
                active: req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined,
                type: req.query.type,
                targetAudience: req.query.targetAudience
            };

            const announcements = await announcementService.listAnnouncements(filters);

            res.status(200).json({
                success: true,
                data: announcements
            });
        } catch (error) {
            console.error('[AnnouncementController] List error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async deleteAnnouncement(req, res) {
        try {
            const { announcementId } = req.params;
            const adminId = req.user.userid;

            const result = await announcementService.deleteAnnouncement(announcementId, adminId);

            res.status(200).json(result);
        } catch (error) {
            console.error('[AnnouncementController] Delete error:', error);
            res.status(404).json({ success: false, message: error.message });
        }
    }

    async updateAnnouncement(req, res) {
        try {
            const { announcementId } = req.params;
            const adminId = req.user.userid;

            const announcement = await announcementService.updateAnnouncement(announcementId, req.body, adminId);

            res.status(200).json({
                success: true,
                message: 'Announcement updated successfully',
                data: announcement
            });
        } catch (error) {
            console.error('[AnnouncementController] Update error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }
}

module.exports = new AnnouncementController();
