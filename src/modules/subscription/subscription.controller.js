const subscriptionService = require('./subscription.service');

class SubscriptionController {
    // --- Admin ---
    async createPlan(req, res) {
        try {
            const plan = await subscriptionService.createPlan(req.body);
            res.status(201).json({ message: "Plan created successfully", plan });
        } catch (err) {
            if (err.message.includes("exists")) return res.status(400).json({ message: err.message });
            res.status(500).json({ message: "Internal server error", error: err.message });
        }
    }

    async updatePlan(req, res) {
        try {
            const plan = await subscriptionService.updatePlan(req.params.planId, req.body);
            res.status(200).json({ message: "Plan updated successfully", plan });
        } catch (err) {
            if (err.message.includes("not found")) return res.status(404).json({ message: err.message });
            res.status(500).json({ message: "Internal server error", error: err.message });
        }
    }

    async deletePlan(req, res) {
        try {
            await subscriptionService.deletePlan(req.params.planId);
            res.status(200).json({ message: "Plan deleted successfully" });
        } catch (err) {
            if (err.message.includes("not found")) return res.status(404).json({ message: err.message });
            res.status(500).json({ message: "Internal server error", error: err.message });
        }
    }

    async getAllPlans(req, res) {
        try {
            const plans = await subscriptionService.getAllPlans();
            res.status(200).json(plans);
        } catch (err) {
            res.status(500).json({ message: "Internal server error", error: err.message });
        }
    }

    async togglePlan(req, res) {
        try {
            const plan = await subscriptionService.togglePlan(req.params.planId);
            res.status(200).json({ message: `Plan ${plan.isActive ? "enabled" : "disabled"} successfully`, plan });
        } catch (err) {
            if (err.message.includes("not found")) return res.status(404).json({ message: err.message });
            res.status(500).json({ message: "Internal server error", error: err.message });
        }
    }

    // --- User ---
    async initSubscription(req, res) {
        try {
            const sub = await subscriptionService.initSubscription(req.user.userid);
            res.status(201).json({ message: "Subscription initialized", subscription: sub });
        } catch (err) {
            if (err.message.includes("exists")) return res.status(400).json({ message: err.message });
            if (err.message.includes("not found")) return res.status(500).json({ message: err.message });
            res.status(500).json({ message: "Internal Server Error", error: err.message });
        }
    }

    async getUserSubscription(req, res) {
        try {
            const { sub, plan } = await subscriptionService.getUserSubscription(req.user.userid);
            res.status(200).json({ subscription: sub, plan });
        } catch (err) {
            res.status(400).json({ message: err.message });
        }
    }

    async upgradeSubscription(req, res) {
        try {
            const sub = await subscriptionService.upgradeSubscription(req.user.userid, req.body.targetPlanId);
            res.status(200).json({ message: "Subscription upgraded successfully", subscription: sub });
        } catch (err) {
            if (err.message.includes("not found")) return res.status(404).json({ message: err.message });
            res.status(500).json({ message: "Internal server error", error: err.message });
        }
    }

    async downgradeSubscription(req, res) {
        try {
            const sub = await subscriptionService.downgradeSubscription(req.user.userid, req.body.targetPlanId);
            res.status(200).json({ message: "Subscription downgraded successfully", subscription: sub });
        } catch (err) {
            if (err.message.includes("not found")) return res.status(404).json({ message: err.message });
            res.status(500).json({ message: "Internal server error", error: err.message });
        }
    }

    async updateBillingCycle(req, res) {
        try {
            const sub = await subscriptionService.updateBillingCycle(req.user.userid, req.body.billingCycle);
            res.status(200).json({ message: "Billing cycle updated", subscription: sub });
        } catch (err) {
            if (err.message.includes("Invalid")) return res.status(400).json({ message: err.message });
            res.status(500).json({ message: "Internal server error", error: err.message });
        }
    }

    async cancelSubscription(req, res) {
        try {
            const sub = await subscriptionService.cancelSubscription(req.user.userid);
            res.status(200).json({ message: "Subscription cancelled", subscription: sub });
        } catch (err) {
            res.status(500).json({ message: "Internal server error", error: err.message });
        }
    }

    async reactivateSubscription(req, res) {
        try {
            const sub = await subscriptionService.reactivateSubscription(req.user.userid);
            res.status(200).json({ message: "Subscription reactivated", subscription: sub });
        } catch (err) {
            res.status(500).json({ message: "Internal server error", error: err.message });
        }
    }

    /**
     * Calculate enterprise pricing based on device count
     */
    async calculatePricing(req, res) {
        try {
            const pricingService = require('../../services/pricingService');
            const { planId, deviceCount } = req.query;

            if (!planId || !deviceCount) {
                return res.status(400).json({
                    message: "Missing required parameters: planId and deviceCount"
                });
            }

            const Plan = require('../../models/subscriptions/Plan');
            const plan = await Plan.findOne({ planId, isActive: true });

            if (!plan) {
                return res.status(404).json({ message: "Plan not found" });
            }

            // Calculate pricing for both monthly and yearly
            const pricing = pricingService.calculateCompletePricing(
                plan.priceMonthly,
                plan.priceYearly,
                parseInt(deviceCount)
            );

            res.status(200).json({
                planName: plan.name,
                ...pricing
            });
        } catch (err) {
            res.status(500).json({ message: "Internal server error", error: err.message });
        }
    }

    /**
     * Get all enterprise tiers
     */
    async getEnterpriseTiers(req, res) {
        try {
            const pricingService = require('../../services/pricingService');
            const tiers = pricingService.getAllTiers();
            res.status(200).json({ tiers });
        } catch (err) {
            res.status(500).json({ message: "Internal server error", error: err.message });
        }
    }
}

module.exports = new SubscriptionController();
