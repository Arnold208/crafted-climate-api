const express = require("express");
const router = express.Router();
const Plan = require("../../model/subscriptions/Plan");
const authenticateToken = require("../../middleware/bearermiddleware");
const authorizeRoles = require("../../middleware/rbacMiddleware");
const { v4: uuidv4 } = require("uuid");

/**
 * @swagger
 * tags:
 *   name: Subscription Plans
 *   description: Admin management of subscription plans
 */

/**
 * @swagger
 * /api/subscriptions/admin/create-plan:
 *   post:
 *     tags: [Subscription Plans]
 *     summary: Create a new subscription plan (Admin only)
 *     description: Allows an admin to create a new subscription plan with usage limits and feature access levels.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, maxDevices, maxDataRetentionDays]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "freemium"
 *               description:
 *                 type: string
 *                 example: "Basic free plan with limited access"
 *               priceMonthly:
 *                 type: number
 *                 example: 0
 *               priceYearly:
 *                 type: number
 *                 example: 0
 *               maxDevices:
 *                 type: number
 *                 example: 5
 *               maxDataRetentionDays:
 *                 type: number
 *                 example: 30
 *               maxDataExportMonths:
 *                 type: number
 *                 example: 0
 *               features:
 *                 type: object
 *                 properties:
 *                   fullSensorAccess:
 *                     type: boolean
 *                     example: false
 *                   aiInsightsLevel:
 *                     type: string
 *                     enum: [none, basic, moderate, advanced]
 *                     example: "basic"
 *                   apiAccess:
 *                     type: string
 *                     enum: [none, limited, full]
 *                     example: "none"
 *                   alerts:
 *                     type: string
 *                     enum: [none, basic, smart, automated]
 *                     example: "basic"
 *                   exportEnabled:
 *                     type: boolean
 *                     example: false
 *                   firmwareUpdates:
 *                     type: boolean
 *                     example: false
 *                   customerSupportLevel:
 *                     type: string
 *                     enum: [none, 48h, 24/7]
 *                     example: "none"
 *               enterprise:
 *                 type: object
 *                 properties:
 *                   enableSLAs:
 *                     type: boolean
 *                     example: false
 *                   dedicatedAccountManager:
 *                     type: boolean
 *                     example: false
 *                   customDeployments:
 *                     type: boolean
 *                     example: false
 *               isActive:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Plan created successfully.
 *       400:
 *         description: Plan already exists.
 *       500:
 *         description: Server error.
 */
router.post(
  "/create-plan",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const data = req.body;

      const exists = await Plan.findOne({ name: data.name.toLowerCase() });
      if (exists) {
        return res.status(400).json({ message: "Plan name already exists." });
      }

      const newPlan = await Plan.create({
        planId: uuidv4(),
        name: data.name.toLowerCase(),
        description: data.description || "",
        priceMonthly: data.priceMonthly || 0,
        priceYearly: data.priceYearly || 0,
        maxDevices: data.maxDevices,
        maxDataRetentionDays: data.maxDataRetentionDays,
        maxDataExportMonths: data.maxDataExportMonths,
        features: data.features || {},
        enterprise: data.enterprise || {},
        isActive: data.isActive ?? true
      });

      res.status(201).json({ message: "Plan created successfully", plan: newPlan });
    } catch (err) {
      console.error("Error creating plan:", err);
      res.status(500).json({ message: "Internal server error", error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/subscriptions/admin/update-plan/{planId}:
 *   put:
 *     tags: [Subscription Plans]
 *     summary: Update an existing subscription plan (Admin only)
 *     security:
 *       - bearerAuth: []
 *     description: Allows editing any fields of an existing subscription plan using its UUID planId.
 *     parameters:
 *       - in: path
 *         name: planId
 *         required: true
 *         schema:
 *           type: string
 *         description: UUID of the subscription plan
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example:
 *               priceMonthly: 20
 *               maxDevices: 50
 *               features:
 *                 apiAccess: "limited"
 *     responses:
 *       200:
 *         description: Plan updated successfully.
 *       404:
 *         description: Plan not found.
 *       500:
 *         description: Server error.
 */
router.put(
  "/update-plan/:planId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const { planId } = req.params;
      const updates = req.body;

      const updatedPlan = await Plan.findOneAndUpdate(
        { planId },
        { $set: updates },
        { new: true }
      );

      if (!updatedPlan) {
        return res.status(404).json({ message: "Plan not found." });
      }

      res.status(200).json({
        message: "Plan updated successfully",
        plan: updatedPlan
      });
    } catch (err) {
      console.error("Error updating plan:", err);
      res.status(500).json({ message: "Internal server error", error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/subscriptions/admin/delete-plan/{planId}:
 *   delete:
 *     tags: [Subscription Plans]
 *     summary: Delete a subscription plan (Admin only)
 *     security:
 *       - bearerAuth: []
 *     description: Deletes a subscription plan using its UUID planId.
 *     parameters:
 *       - in: path
 *         name: planId
 *         required: true
 *         schema:
 *           type: string
 *         description: UUID of the plan
 *     responses:
 *       200:
 *         description: Plan deleted successfully.
 *       404:
 *         description: Plan not found.
 *       500:
 *         description: Server error.
 */
router.delete(
  "/delete-plan/:planId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const { planId } = req.params;

      const deleted = await Plan.findOneAndDelete({ planId });

      if (!deleted) {
        return res.status(404).json({ message: "Plan not found." });
      }

      res.status(200).json({ message: "Plan deleted successfully" });
    } catch (err) {
      console.error("Error deleting plan:", err);
      res.status(500).json({ message: "Internal server error", error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/subscriptions/admin/plans:
 *   get:
 *     tags: [Subscription Plans]
 *     summary: Get all subscription plans (Admin only)
 *     security:
 *       - bearerAuth: []
 *     description: Returns a list of all created subscription plans.
 *     responses:
 *       200:
 *         description: List of plans retrieved successfully.
 *       500:
 *         description: Server error.
 */
router.get(
  "/plans",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const plans = await Plan.find();
      res.status(200).json(plans);
    } catch (err) {
      res.status(500).json({ message: "Internal server error", error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/subscriptions/admin/toggle-plan/{planId}:
 *   patch:
 *     tags: [Subscription Plans]
 *     summary: Enable or disable a subscription plan (Admin only)
 *     security:
 *       - bearerAuth: []
 *     description: Toggles the active status of a subscription plan.
 *     parameters:
 *       - in: path
 *         name: planId
 *         required: true
 *         schema:
 *           type: string
 *         description: UUID of the plan
 *     responses:
 *       200:
 *         description: Plan status updated.
 *       404:
 *         description: Plan not found.
 *       500:
 *         description: Server error.
 */
router.patch(
  "/toggle-plan/:planId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const { planId } = req.params;

      const plan = await Plan.findOne({ planId });
      if (!plan) return res.status(404).json({ message: "Plan not found." });

      plan.isActive = !plan.isActive;
      await plan.save();

      res.status(200).json({
        message: `Plan ${plan.isActive ? "enabled" : "disabled"} successfully`,
        plan
      });
    } catch (err) {
      res.status(500).json({ message: "Internal server error", error: err.message });
    }
  }
);

module.exports = router;
