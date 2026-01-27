const analyticsService = require('../analytics/analytics.service');

class AdminController {

    /**
     * GET /api/admin/dashboard
     * Returns high-level system metrics
     */
    async getDashboard(req, res) {
        try {
            // Strictly assume RBAC middleware checked for 'admin' role already
            const stats = await analyticsService.getSystemOverview();
            res.json(stats);
        } catch (error) {
            console.error("Admin Dashboard Error:", error);
            res.status(500).json({ message: "Failed to load dashboard metrics" });
        }
    }
}

module.exports = new AdminController();
