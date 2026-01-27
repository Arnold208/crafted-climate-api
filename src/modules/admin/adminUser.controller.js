const adminUserService = require('../../services/adminUser.service');

class AdminUserController {

    /**
     * List all users
     */
    async listUsers(req, res) {
        try {
            const filters = {
                search: req.query.search,
                platformRole: req.query.role,
                verified: req.query.verified === 'true' ? true : req.query.verified === 'false' ? false : undefined,
                deletedAt: req.query.deleted
            };

            const pagination = {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 50
            };

            const result = await adminUserService.listUsers(filters, pagination);

            res.status(200).json({
                success: true,
                data: result.users,
                pagination: result.pagination
            });
        } catch (error) {
            console.error('[AdminUserController] List users error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Get user details
     */
    async getUserDetails(req, res) {
        try {
            const { userid } = req.params;
            const user = await adminUserService.getUserDetails(userid);

            res.status(200).json({
                success: true,
                data: user
            });
        } catch (error) {
            console.error('[AdminUserController] Get user details error:', error);
            res.status(404).json({ success: false, message: error.message });
        }
    }

    /**
     * Change user role
     */
    async changeUserRole(req, res) {
        try {
            const { userid } = req.params;
            const { role } = req.body;
            const adminId = req.user.userid;

            if (!role) {
                return res.status(400).json({ success: false, message: 'Role is required' });
            }

            const result = await adminUserService.changeUserRole(userid, role, adminId);

            res.status(200).json({
                success: true,
                message: 'User role updated successfully',
                data: result
            });
        } catch (error) {
            console.error('[AdminUserController] Change role error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Suspend user
     */
    async suspendUser(req, res) {
        try {
            const { userid } = req.params;
            const { reason } = req.body;
            const adminId = req.user.userid;

            if (!reason) {
                return res.status(400).json({ success: false, message: 'Reason is required' });
            }

            const result = await adminUserService.suspendUser(userid, reason, adminId);

            res.status(200).json(result);
        } catch (error) {
            console.error('[AdminUserController] Suspend user error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Restore user
     */
    async restoreUser(req, res) {
        try {
            const { userid } = req.params;
            const adminId = req.user.userid;

            const result = await adminUserService.restoreUser(userid, adminId);

            res.status(200).json(result);
        } catch (error) {
            console.error('[AdminUserController] Restore user error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Delete user permanently
     */
    async deleteUser(req, res) {
        try {
            const { userid } = req.params;
            const adminId = req.user.userid;

            const result = await adminUserService.deleteUser(userid, adminId);

            res.status(200).json(result);
        } catch (error) {
            console.error('[AdminUserController] Delete user error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Force password reset
     */
    async forcePasswordReset(req, res) {
        try {
            const { userid } = req.params;
            const adminId = req.user.userid;

            const result = await adminUserService.forcePasswordReset(userid, adminId);

            res.status(200).json(result);
        } catch (error) {
            console.error('[AdminUserController] Force password reset error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /**
     * Get user activity
     */
    async getUserActivity(req, res) {
        try {
            const { userid } = req.params;
            const dateRange = {
                startDate: req.query.startDate,
                endDate: req.query.endDate
            };

            const result = await adminUserService.getUserActivity(userid, dateRange);

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[AdminUserController] Get user activity error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = new AdminUserController();
