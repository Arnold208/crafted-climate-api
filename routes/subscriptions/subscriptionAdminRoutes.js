// routes/api/subscriptions/subscriptionAdminRoutes.js

const express = require("express");
const router = express.Router();

const Plan = require("../../model/subscriptions/Plan");
const UserSubscription = require("../../model/subscriptions/UserSubscription");
const OrgSubscription = require("../../model/subscriptions/OrgSubscription");
const User = require("../../model/user/userModel");
const Organization = require("../../model/organization/organizationModel");

const authenticateToken = require("../../middleware/user/bearermiddleware");
const authorizeRoles = require("../../middleware/user/rbacMiddleware");
const { v4: uuidv4 } = require("uuid");

/**
 * @swagger
 * tags:
 *   name: Subscription Plans (Admin)
 *   description: Superadmin-only APIs for managing billing plans & subscriptions
 */

/**
 * @swagger
 * /api/subscriptions/admin/create-plan:
 *   post:
 *     tags: [Subscription Plans (Admin)]
 *     summary: Create a new subscription plan (Admin only)
 *     security:
 *       - bearerAuth: []
 *     description: Allows the system superadmin to create a new subscription plan.
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
 *                 example: "Basic free plan with limited features"
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
 *                 example: 7
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
 *                     example: "none"
 *                   apiAccess:
 *                     type: string
 *                     enum: [none, limited, full]
 *                     example: "none"
 *                   alerts:
 *                     type: string
 *                     enum: [none, basic, smart, automated]
 *                     example: "none"
 *                   firmwareUpdates:
 *                     type: boolean
 *                     example: false
 *                   customerSupportLevel:
 *                     type: string
 *                     enum: [none, 48h, 24/7]
 *                     example: "none"
 *                   device_read:
 *                     type: boolean
 *                     example: true
 *                   device_update:
 *                     type: boolean
 *                     example: false
 *                   collaboration:
 *                     type: boolean
 *                     example: false
 *                   location_access:
 *                     type: boolean
 *                     example: false
 *                   public_listing:
 *                     type: boolean
 *                     example: true
 *                   export:
 *                     type: boolean
 *                     example: false
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
 *         description: Plan name already exists.
 *       500:
 *         description: Internal server error.
 */
router.post(
  "/create-plan",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const data = req.body;
      const name = data.name.toLowerCase().trim();

      const exists = await Plan.findOne({ name });
      if (exists) {
        return res.status(400).json({ message: "Plan name already exists." });
      }

      const newPlan = await Plan.create({
        planId: uuidv4(),
        name,
        description: data.description || "",
        priceMonthly: data.priceMonthly || 0,
        priceYearly: data.priceYearly || 0,
        maxDevices: data.maxDevices,
        maxDataRetentionDays: data.maxDataRetentionDays,
        maxDataExportMonths: data.maxDataExportMonths || 0,
        features: data.features || {},
        enterprise: data.enterprise || {},
        isActive: data.isActive ?? true
      });

      res.status(201).json({
        message: "Plan created successfully",
        plan: newPlan
      });
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
 *     tags: [Subscription Plans (Admin)]
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
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example:
 *               priceMonthly: 29
 *               maxDevices: 20
 *               features:
 *                 apiAccess: "limited"
 *                 device_update: true
 *     responses:
 *       200:
 *         description: Plan updated successfully.
 *       404:
 *         description: Plan not found.
 *       500:
 *         description: Internal server error.
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
 *     tags: [Subscription Plans (Admin)]
 *     summary: Delete a subscription plan (Admin only)
 *     security:
 *       - bearerAuth: []
 *     description: Deletes a subscription plan using its UUID planId. Use with care.
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
 *         description: Internal server error.
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
 *     tags: [Subscription Plans (Admin)]
 *     summary: Get all subscription plans (Admin only)
 *     security:
 *       - bearerAuth: []
 *     description: Returns a list of all created subscription plans.
 *     responses:
 *       200:
 *         description: List of plans retrieved successfully.
 *       500:
 *         description: Internal server error.
 */
router.get(
  "/plans",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const plans = await Plan.find().sort({ createdAt: -1 });
      res.status(200).json(plans);
    } catch (err) {
      console.error("Error fetching plans:", err);
      res.status(500).json({ message: "Internal server error", error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/subscriptions/admin/toggle-plan/{planId}:
 *   patch:
 *     tags: [Subscription Plans (Admin)]
 *     summary: Enable or disable a subscription plan (Admin only)
 *     security:
 *       - bearerAuth: []
 *     description: Toggles the active status of a subscription plan. When inactive, it cannot be selected for new subscriptions.
 *     parameters:
 *       - in: path
 *         name: planId
 *         required: true
 *         schema:
 *           type: string
 *         description: UUID of the plan
 *     responses:
 *       200:
 *         description: Plan status updated successfully.
 *       404:
 *         description: Plan not found.
 *       500:
 *         description: Internal server error.
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
      console.error("Error toggling plan:", err);
      res.status(500).json({ message: "Internal server error", error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/subscriptions/admin/assign-plan-to-user:
 *   post:
 *     tags: [Subscription Plans (Admin)]
 *     summary: Force assign a subscription plan to a user (Admin only)
 *     security:
 *       - bearerAuth: []
 *     description: >
 *       Updates an existing user subscription to a new plan.
 *       Useful for manual upgrades/downgrades handled by support/superadmin.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userid, planId]
 *             properties:
 *               userid:
 *                 type: string
 *                 example: "usr_abc123"
 *               planId:
 *                 type: string
 *                 example: "a2f7ffb4-42de-4d75-9e56-48f7c9a0aa11"
 *     responses:
 *       200:
 *         description: User subscription updated successfully.
 *       404:
 *         description: User subscription or plan not found.
 *       500:
 *         description: Internal server error.
 */
router.post(
  "/assign-plan-to-user",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const { userid, planId } = req.body;

      const plan = await Plan.findOne({ planId });
      if (!plan) return res.status(404).json({ message: "Plan not found." });

      const updated = await UserSubscription.findOneAndUpdate(
        { userid },
        { planId },
        { new: true }
      );

      if (!updated) {
        return res.status(404).json({ message: "User subscription not found." });
      }

      res.status(200).json({
        message: "User subscription updated successfully",
        subscription: updated
      });
    } catch (err) {
      console.error("Error assigning plan to user:", err);
      res.status(500).json({ message: "Internal server error", error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/subscriptions/admin/all-user-subscriptions:
 *   get:
 *     tags: [Subscription Plans (Admin)]
 *     summary: Get all user subscriptions (Admin only)
 *     security:
 *       - bearerAuth: []
 *     description: Returns a list of all user-level subscriptions.
 *     responses:
 *       200:
 *         description: List of user subscriptions.
 *       500:
 *         description: Internal server error.
 */
router.get(
  "/all-user-subscriptions",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const subs = await UserSubscription.find().sort({ createdAt: -1 });
      res.status(200).json(subs);
    } catch (err) {
      console.error("Error fetching user subscriptions:", err);
      res.status(500).json({ message: "Internal server error", error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/subscriptions/admin/deactivate-user-subscription/{userid}:
 *   patch:
 *     tags: [Subscription Plans (Admin)]
 *     summary: Deactivate a user's subscription
 *     security:
 *       - bearerAuth: []
 *     description: Sets the status of a user's subscription to inactive.
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema:
 *           type: string
 *         description: CraftedClimate userid (not Mongo _id)
 *     responses:
 *       200:
 *         description: Subscription deactivated successfully.
 *       404:
 *         description: Subscription not found.
 *       500:
 *         description: Internal server error.
 */
router.patch(
  "/deactivate-user-subscription/:userid",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const { userid } = req.params;

      const sub = await UserSubscription.findOne({ userid });
      if (!sub) return res.status(404).json({ message: "Subscription not found." });

      sub.status = "inactive";
      await sub.save();

      res.status(200).json({
        message: "User subscription deactivated",
        subscription: sub
      });
    } catch (err) {
      console.error("Error deactivating user subscription:", err);
      res.status(500).json({ message: "Internal server error", error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/subscriptions/admin/all-org-subscriptions:
 *   get:
 *     tags: [Subscription Plans (Admin)]
 *     summary: Get all organization subscriptions (Admin only)
 *     security:
 *       - bearerAuth: []
 *     description: Returns a list of all organization-level subscriptions.
 *     responses:
 *       200:
 *         description: List of org subscriptions.
 *       500:
 *         description: Internal server error.
 */
router.get(
  "/all-org-subscriptions",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const subs = await OrgSubscription.find().sort({ createdAt: -1 });
      res.status(200).json(subs);
    } catch (err) {
      console.error("Error fetching org subscriptions:", err);
      res.status(500).json({ message: "Internal server error", error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/subscriptions/admin/assign-plan-to-org:
 *   post:
 *     tags: [Subscription Plans (Admin)]
 *     summary: Assign a subscription plan to an organization
 *     security:
 *       - bearerAuth: []
 *     description: >
 *       Updates an existing organization subscription to a new plan.
 *       Typically used by billing/support admins after payment confirmation.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orgid, planId]
 *             properties:
 *               orgid:
 *                 type: string
 *                 example: "org_1234"
 *               planId:
 *                 type: string
 *                 example: "a2f7ffb4-42de-4d75-9e56-48f7c9a0aa11"
 *     responses:
 *       200:
 *         description: Organization subscription updated.
 *       404:
 *         description: Organization subscription or plan not found.
 *       500:
 *         description: Internal server error.
 */
router.post(
  "/assign-plan-to-org",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const { orgid, planId } = req.body;

      const plan = await Plan.findOne({ planId });
      if (!plan) return res.status(404).json({ message: "Plan not found." });

      const updated = await OrgSubscription.findOneAndUpdate(
        { orgid },
        { planId },
        { new: true }
      );

      if (!updated) {
        return res.status(404).json({ message: "Organization subscription not found." });
      }

      res.status(200).json({
        message: "Organization subscription updated",
        subscription: updated
      });
    } catch (err) {
      console.error("Error assigning plan to org:", err);
      res.status(500).json({ message: "Internal server error", error: err.message });
    }
  }
);

module.exports = router;
