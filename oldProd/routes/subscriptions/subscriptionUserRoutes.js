const express = require("express");
const router = express.Router();

const UserSubscription = require("../../model/subscriptions/UserSubscription");
const Plan = require("../../model/subscriptions/Plan");
const authenticateToken = require("../../middleware/bearermiddleware");
const getUserPlan = require("../../middleware/subscriptions/getUserPlan");

/**
 * @swagger
 * tags:
 *   name: User Subscriptions
 *   description: User subscription management (view, upgrade, downgrade, cancel)
 */


/**
 * @swagger
 * /api/subscriptions/user/init:
 *   post:
 *     tags: [User Subscriptions]
 *     summary: Initialize a default FREEMIUM subscription for the authenticated user
 *     description: >
 *       Creates a new FREEMIUM subscription for the logged-in user if they do not already have one.
 *       This route is useful for recovery, onboarding, or after introducing a new subscription system.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Subscription initialized successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Subscription initialized"
 *                 subscription:
 *                   type: object
 *                   description: The created subscription object.
 *       400:
 *         description: Subscription already exists for the user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Subscription already exists"
 *       500:
 *         description: Server error occurred.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Internal Server Error"
 *                 error:
 *                   type: string
 */

router.post("/init", authenticateToken, async (req, res) => {
  try {
    const { userid } = req.user;
    console.log(userid)
    const existing = await UserSubscription.findOne({ userid: userid });
    if (existing) {
      return res.status(400).json({ message: "Subscription already exists" });
    }

    const free = await Plan.findOne({ name: "freemium" });
    if (!free) {
      return res.status(500).json({ message: "FREEMIUM plan not found. Please run plan migration." });
    }

    const sub = await UserSubscription.create({
      userid: userid,
      planId: free.planId,
      status: "active",
      billingCycle: "monthly",
      startDate: new Date()
    });

    res.status(201).json({ 
      message: "Subscription initialized", 
      subscription: sub 
    });

  } catch (err) {
    res.status(500).json({ 
      message: "Internal Server Error", 
      error: err.message 
    });
  }
});


/**
 * @swagger
 * /api/subscriptions/user/my-subscription:
 *   get:
 *     tags: [User Subscriptions]
 *     summary: Get the current user's active subscription
 *     description: Returns subscription details and the associated plan for the authenticated user.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription data returned successfully.
 *       400:
 *         description: Unable to retrieve subscription.
 *       500:
 *         description: Server error.
 */
router.get(
  "/my-subscription",
  authenticateToken,
  async (req, res) => {
    try {
      const { userid } = req.user;
        console.log(userid)
      const { sub, plan } = await getUserPlan(userid);

      res.status(200).json({ subscription: sub, plan });
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  }
);

/**
 * @swagger
 * /api/subscriptions/user/upgrade:
 *   post:
 *     tags: [User Subscriptions]
 *     summary: Upgrade subscription to a higher plan
 *     description: Allows a logged-in user to upgrade their plan to any active plan using its UUID.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetPlanId]
 *             properties:
 *               targetPlanId:
 *                 type: string
 *                 description: UUID of the plan to switch to
 *                 example: "b67e22d3-22f9-4b71-9b27-e29c28c0f04a"
 *     responses:
 *       200:
 *         description: Subscription upgraded successfully.
 *       404:
 *         description: Target plan not found or inactive.
 *       500:
 *         description: Internal server error.
 */
router.post(
  "/upgrade",
  authenticateToken,
  async (req, res) => {
    try {
      const { userid } = req.user;
      const { targetPlanId } = req.body;

      const targetPlan = await Plan.findOne({ planId: targetPlanId, isActive: true });
      if (!targetPlan) {
        return res.status(404).json({ message: "Target plan not found or inactive." });
      }

      const subscription = await UserSubscription.findOne({ userid: userid });

      subscription.planId = targetPlanId;
      subscription.status = "active";
      subscription.billingCycle = "monthly"; 
      subscription.startDate = new Date();
      subscription.endDate = null;

      await subscription.save();

      res.status(200).json({ message: "Subscription upgraded successfully", subscription });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error", error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/subscriptions/user/downgrade:
 *   post:
 *     tags: [User Subscriptions]
 *     summary: Downgrade subscription to a lower plan
 *     description: Allows users to move from a higher plan to a lower plan.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetPlanId]
 *             properties:
 *               targetPlanId:
 *                 type: string
 *                 description: UUID of the plan to downgrade to
 *                 example: "9af1d7e2-30c8-4bca-8bb3-3cf41e8e0b12"
 *     responses:
 *       200:
 *         description: Subscription downgraded successfully.
 *       404:
 *         description: Plan not found.
 *       500:
 *         description: Server error.
 */
router.post(
  "/downgrade",
  authenticateToken,
  async (req, res) => {
    try {
      const { userid } = req.user;
      const { targetPlanId } = req.body;

      const plan = await Plan.findOne({ planId: targetPlanId });
      if (!plan) return res.status(404).json({ message: "Plan not found." });

      const subscription = await UserSubscription.findOne({ userid: userid });

      subscription.planId = plan.planId;
      subscription.status = "active";
      subscription.startDate = new Date();
      subscription.endDate = null;

      await subscription.save();

      res.status(200).json({ message: "Subscription downgraded successfully", subscription });
    } catch (err) {
      res.status(500).json({ message: "Internal server error", error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/subscriptions/user/billing-cycle:
 *   patch:
 *     tags: [User Subscriptions]
 *     summary: Update billing cycle
 *     description: Allows users to switch between monthly or yearly billing.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [billingCycle]
 *             properties:
 *               billingCycle:
 *                 type: string
 *                 enum: [monthly, yearly]
 *                 example: "yearly"
 *     responses:
 *       200:
 *         description: Billing cycle updated.
 *       400:
 *         description: Invalid billing cycle.
 *       500:
 *         description: Server error.
 */
router.patch(
  "/billing-cycle",
  authenticateToken,
  async (req, res) => {
    try {
      const { userid } = req.user;
      const { billingCycle } = req.body;

      if (!["monthly", "yearly"].includes(billingCycle)) {
        return res.status(400).json({ message: "Invalid billing cycle" });
      }

      const subscription = await UserSubscription.findOne({ userid: userid });

      subscription.billingCycle = billingCycle;
      await subscription.save();

      res.status(200).json({ message: "Billing cycle updated", subscription });
    } catch (err) {
      res.status(500).json({ message: "Internal server error", error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/subscriptions/user/cancel:
 *   post:
 *     tags: [User Subscriptions]
 *     summary: Cancel the current subscription
 *     description: Marks the subscription as cancelled and sets an end date.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription cancelled successfully.
 *       500:
 *         description: Server error.
 */
router.post(
  "/cancel",
  authenticateToken,
  async (req, res) => {
    try {
      const { userid } = req.user;

      const subscription = await UserSubscription.findOne({ userid: userid });
      subscription.status = "cancelled";
      subscription.endDate = new Date();
      await subscription.save();

      res.status(200).json({ message: "Subscription cancelled", subscription });
    } catch (err) {
      res.status(500).json({ message: "Internal server error", error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/subscriptions/user/reactivate:
 *   post:
 *     tags: [User Subscriptions]
 *     summary: Reactivate a cancelled subscription
 *     description: Allows users to restore a cancelled subscription.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription reactivated successfully.
 *       500:
 *         description: Server error.
 */
router.post(
  "/reactivate",
  authenticateToken,
  async (req, res) => {
    try {
      const { userid } = req.user;

      const subscription = await UserSubscription.findOne({ userid: userid });
      subscription.status = "active";
      subscription.endDate = null;
      await subscription.save();

      res.status(200).json({ message: "Subscription reactivated", subscription });
    } catch (err) {
      res.status(500).json({ message: "Internal server error", error: err.message });
    }
  }
);

module.exports = router;
