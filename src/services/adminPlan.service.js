const Plan = require('../models/subscriptions/Plan');
const { createAuditLog } = require('../utils/auditLogger');
const { v4: uuidv4 } = require('uuid');

/**
 * Admin Plan Service
 * Platform admin operations for managing subscription plans
 */
class AdminPlanService {

    /**
     * List all plans
     */
    async listPlans(filters = {}) {
        const query = {};

        if (filters.isActive !== undefined) {
            query.isActive = filters.isActive;
        }

        const plans = await Plan.find(query).sort({ priceMonthly: 1 }).lean();

        return plans;
    }

    /**
     * Get plan details
     */
    async getPlan(planId) {
        const plan = await Plan.findOne({ planId }).lean();
        if (!plan) {
            throw new Error('Plan not found');
        }
        return plan;
    }

    /**
     * Create new plan
     */
    async createPlan(data, adminId) {
        // Check for duplicate name
        const existing = await Plan.findOne({ name: data.name });
        if (existing) {
            throw new Error('Plan with this name already exists');
        }

        const plan = new Plan({
            ...data,
            planId: uuidv4()
        });

        await plan.save();

        // Audit log
        await createAuditLog({
            action: 'ADMIN_CREATE_PLAN',
            userid: adminId,
            details: {
                planId: plan.planId,
                name: plan.name
            },
            ipAddress: null
        });

        return plan;
    }

    /**
     * Update existing plan
     */
    async updatePlan(planId, data, adminId) {
        const plan = await Plan.findOne({ planId });
        if (!plan) {
            throw new Error('Plan not found');
        }

        // Check name uniqueness if changing name
        if (data.name && data.name !== plan.name) {
            const existing = await Plan.findOne({ name: data.name });
            if (existing) {
                throw new Error('Plan with this name already exists');
            }
        }

        // Apply updates
        Object.assign(plan, data);
        await plan.save();

        // Audit log
        await createAuditLog({
            action: 'ADMIN_UPDATE_PLAN',
            userid: adminId,
            details: {
                planId,
                updates: Object.keys(data)
            },
            ipAddress: null
        });

        return plan;
    }

    /**
     * Delete (or deactivate) plan
     */
    async deletePlan(planId, adminId) {
        const plan = await Plan.findOne({ planId });
        if (!plan) {
            throw new Error('Plan not found');
        }

        // Soft delete by setting isActive = false
        // Hard delete only if necessary, but soft is safer for existing subscriptions
        plan.isActive = false;
        await plan.save();

        // Audit log
        await createAuditLog({
            action: 'ADMIN_DELETE_PLAN',
            userid: adminId,
            details: {
                planId,
                name: plan.name
            },
            ipAddress: null
        });

        return {
            success: true,
            message: 'Plan deactivated successfully'
        };
    }
}

module.exports = new AdminPlanService();
