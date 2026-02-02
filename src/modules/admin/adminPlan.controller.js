const adminPlanService = require('../../services/adminPlan.service');

class AdminPlanController {

    async listPlans(req, res) {
        try {
            const filters = {
                isActive: req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined
            };

            const result = await adminPlanService.listPlans(filters);

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[AdminPlanController] List error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async getPlan(req, res) {
        try {
            const { planId } = req.params;
            const result = await adminPlanService.getPlan(planId);

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[AdminPlanController] Get error:', error);
            res.status(404).json({ success: false, message: error.message });
        }
    }

    async createPlan(req, res) {
        try {
            const adminId = req.user.userid;
            const result = await adminPlanService.createPlan(req.body, adminId);

            res.status(201).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[AdminPlanController] Create error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    async updatePlan(req, res) {
        try {
            const { planId } = req.params;
            const adminId = req.user.userid;
            const result = await adminPlanService.updatePlan(planId, req.body, adminId);

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[AdminPlanController] Update error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }

    async deletePlan(req, res) {
        try {
            const { planId } = req.params;
            const adminId = req.user.userid;
            const result = await adminPlanService.deletePlan(planId, adminId);

            res.status(200).json(result);
        } catch (error) {
            console.error('[AdminPlanController] Delete error:', error);
            res.status(400).json({ success: false, message: error.message });
        }
    }
}

module.exports = new AdminPlanController();
