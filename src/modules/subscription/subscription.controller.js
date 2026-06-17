const subscriptionService = require('./subscription.service');
const Organization = require('../../models/organization/organizationModel');
const Plan = require('../../models/subscriptions/Plan');

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
            // Use the subscription ID from the authenticated user context (ensured by middleware)
            const subscriptionId = req.user.subscription;
            if (!subscriptionId) {
                return res.status(400).json({ message: "No active subscription found for this user." });
            }

            const sub = await subscriptionService.upgradeSubscription(req.user.userid, subscriptionId, req.body.targetPlanId);
            res.status(200).json({ message: "Subscription upgraded successfully", subscription: sub });
        } catch (err) {
            if (err.message.includes("not found")) return res.status(404).json({ message: err.message });
            res.status(500).json({ message: "Internal server error", error: err.message });
        }
    }

    async downgradeSubscription(req, res) {
        try {
            const subscriptionId = req.user.subscription;
            if (!subscriptionId) {
                return res.status(400).json({ message: "No active subscription found for this user." });
            }

            const sub = await subscriptionService.downgradeSubscription(req.user.userid, subscriptionId, req.body.targetPlanId);
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
            const subscriptionId = req.user.subscription;
            if (!subscriptionId) {
                return res.status(400).json({ message: "No active subscription found for this user." });
            }

            const sub = await subscriptionService.cancelSubscription(req.user.userid, subscriptionId);
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

    // --- Organization ---
    async getOrgSubscription(req, res) {
        try {
            const result = await subscriptionService.getOrgSubscription(req.params.orgId);
            if (!result) return res.status(404).json({ message: "No active subscription found for this organization" });
            res.status(200).json({ subscription: result.sub, plan: result.plan });
        } catch (err) {
            res.status(500).json({ message: "Internal server error", error: err.message });
        }
    }

    async upgradeOrgSubscription(req, res) {
        try {
            const sub = await subscriptionService.upgradeOrgSubscription(req.params.orgId, req.body.targetPlanId, req.user.userid);
            res.status(200).json({ message: "Organization subscription upgraded successfully", subscription: sub });
        } catch (err) {
            if (err.message.includes("not found")) return res.status(404).json({ message: err.message });
            res.status(500).json({ message: "Internal server error", error: err.message });
        }
    }

    async downgradeOrgSubscription(req, res) {
        try {
            const sub = await subscriptionService.downgradeOrgSubscription(req.params.orgId, req.body.targetPlanId, req.user.userid);
            res.status(200).json({ message: "Organization subscription downgraded successfully", subscription: sub });
        } catch (err) {
            if (err.message.includes("not found")) return res.status(404).json({ message: err.message });
            res.status(500).json({ message: "Internal server error", error: err.message });
        }
    }

    async updateOrgBillingCycle(req, res) {
        try {
            const sub = await subscriptionService.updateOrgBillingCycle(req.params.orgId, req.body.billingCycle);
            res.status(200).json({ message: "Billing cycle updated", subscription: sub });
        } catch (err) {
            if (err.message.includes("Invalid")) return res.status(400).json({ message: err.message });
            if (err.message.includes("not found")) return res.status(404).json({ message: err.message });
            res.status(500).json({ message: "Internal server error", error: err.message });
        }
    }

    async cancelOrgSubscription(req, res) {
        try {
            const sub = await subscriptionService.cancelOrgSubscription(req.params.orgId);
            res.status(200).json({ message: "Organization subscription cancelled", subscription: sub });
        } catch (err) {
            if (err.message.includes("not found")) return res.status(404).json({ message: err.message });
            res.status(500).json({ message: "Internal server error", error: err.message });
        }
    }

    async reactivateOrgSubscription(req, res) {
        try {
            const sub = await subscriptionService.reactivateOrgSubscription(req.params.orgId);
            res.status(200).json({ message: "Organization subscription reactivated", subscription: sub });
        } catch (err) {
            if (err.message.includes("not found")) return res.status(404).json({ message: err.message });
            res.status(500).json({ message: "Internal server error", error: err.message });
        }
    }

    async debugFixPlanType(req, res) {
        try {
            const { orgId } = req.params;
            const org = await Organization.findOne({ organizationId: orgId });
            if (!org) return res.status(404).json({ error: "Org not found" });

            const planId = org.subscription?.planId;
            if (!planId) return res.json({ message: "No plan ID", org });

            const plan = await Plan.findOne({ planId });
            if (!plan) return res.json({ message: "Plan not found", planId });

            const oldType = org.planType;
            org.planType = plan.name;
            await org.save();

            res.json({
                success: true,
                orgId,
                planId,
                planName: plan.name,
                oldPlanType: oldType,
                newPlanType: org.planType
            });
        } catch (error) {
            res.status(500).json({ error: error.message, stack: error.stack });
        }
    }

    async verifyOrgPlan(req, res) {
        try {
            const { orgId } = req.params;
            const { PLAN_FEATURES } = require('../../config/planFeatures');
            const UserSubscription = require('../../models/subscriptions/UserSubscription');

            const org = await Organization.findOne({ organizationId: orgId });
            if (!org) return res.status(404).json({ error: "Organization not found" });

            const userSub = await UserSubscription.findOne({
                organizationId: orgId,
                status: 'active'
            });

            const planId = org.subscription?.planId || userSub?.planId;
            let planDetails = null;
            let collaborationStatus = {
                fromPlanDB: false,
                fromConfig: false,
                maxMembers: 0,
                verdict: "❌ CANNOT invite members"
            };

            if (planId) {
                const plan = await Plan.findOne({ planId });
                if (plan) {
                    planDetails = {
                        name: plan.name,
                        description: plan.description,
                        priceMonthly: plan.priceMonthly,
                        priceYearly: plan.priceYearly,
                        maxDevices: plan.maxDevices,
                        dataRetention: plan.maxDataRetentionDays
                    };

                    collaborationStatus.fromPlanDB = plan.features?.collaboration || false;

                    const configFeatures = PLAN_FEATURES[plan.name.toLowerCase()];
                    if (configFeatures) {
                        collaborationStatus.fromConfig = configFeatures.collaboration || false;
                        collaborationStatus.maxMembers = configFeatures.maxMembers || 0;
                    }

                    const canCollaborate = collaborationStatus.fromPlanDB || collaborationStatus.fromConfig;
                    if (canCollaborate) {
                        collaborationStatus.verdict = "✅ CAN invite members";
                    } else {
                        collaborationStatus.verdict = "❌ CANNOT invite members - Upgrade required";
                    }
                }
            }

            res.json({
                organization: {
                    id: org.organizationId,
                    name: org.name,
                    type: org.organizationType,
                    planType: org.planType,
                    subscriptionPlanId: org.subscription?.planId,
                    subscriptionStatus: org.subscription?.status
                },
                userSubscription: userSub ? {
                    planId: userSub.planId,
                    scope: userSub.subscriptionScope,
                    billingCycle: userSub.billingCycle
                } : null,
                plan: planDetails,
                collaboration: collaborationStatus
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getActivePlans(req, res) {
        try {
            const plans = await subscriptionService.getActivePlans();
            res.status(200).json(plans);
        } catch (err) {
            res.status(500).json({ message: "Internal server error", error: err.message });
        }
    }
}

module.exports = new SubscriptionController();
