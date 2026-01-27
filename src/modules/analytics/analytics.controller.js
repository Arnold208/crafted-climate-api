const analyticsService = require('./analytics.service');

class AnalyticsController {

    async getOrgInsights(req, res) {
        try {
            const { orgId } = req.params;

            // req.planFeatures is populated by specific middleware if attached, 
            // OR we fetch it manually if we want to be safe.
            // But 'checkPlanFeature' middleware strictly gates access, so we can assume access is allowed.
            // However, we still need the 'level' details.

            // To be robust, let's assume req.planFeatures might be missing if middleware wasn't used precisely,
            // so we'll pass the params into service or rely on service to re-check.

            // Actually, the Service `getInsights` signature I made expects (orgId, planFeatures).
            // So we MUST ensure planFeatures is passed.
            // We can get it from req.planFeatures (from middleware) OR req.userPlan (from getUserPlan).

            const features = req.planFeatures || {}; // Middleware should provide this.

            const insights = await analyticsService.getInsights(orgId, features);
            res.json(insights);

        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }
}

module.exports = new AnalyticsController();
