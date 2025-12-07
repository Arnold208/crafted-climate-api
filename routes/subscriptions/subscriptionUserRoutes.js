// routes/api/subscriptions/userSubscriptionsRoutes.js

const express = require("express");
const router = express.Router();

const UserSubscription = require("../../model/subscriptions/UserSubscription");
const OrgSubscription = require("../../model/subscriptions/OrgSubscription");
const Plan = require("../../model/subscriptions/Plan");
const Organization = require("../../model/organization/organizationModel");

const authenticateToken = require("../../middleware/user/bearermiddleware");
const getUserPlan = require("../../middleware/subscriptions/getUserPlan");
const { v4: uuidv4 } = require("uuid");

// =========================================================================
// INTERNAL UTILITY — VERIFY ORG ADMIN
// =========================================================================
async function verifyOrgAdmin(userid, orgid) {
  const org = await Organization.findOne({ orgid }).lean();
  if (!org) return false;
  return org.ownerUserid === userid;
}

// =========================================================================
// SWAGGER SECTION DOCUMENT GROUP
// =========================================================================
/**
 * @swagger
 * tags:
 *   - name: User Subscriptions
 *     description: APIs for managing personal and organization subscriptions.
 */

//
// ============================================================================
// PERSONAL SUBSCRIPTION ROUTES
// ============================================================================
//

/**
 * @swagger
 * /api/subscriptions/user/init:
 *   post:
 *     summary: Initialize a default FREEMIUM subscription for a user
 *     description: Creates a freemium subscription for the authenticated user only if one does not already exist.
 *     tags: [User Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Freemium subscription created.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 subscription:
 *                   $ref: '#/components/schemas/UserSubscription'
 *       400:
 *         description: Subscription already exists.
 *       500:
 *         description: Internal server error.
 */
router.post("/init", authenticateToken, async (req, res) => {
  try {
    const { userid } = req.user;

    const existing = await UserSubscription.findOne({ userid });
    if (existing) {
      return res.status(400).json({ message: "Subscription already exists" });
    }

    const free = await Plan.findOne({ name: "freemium", isActive: true });
    if (!free) {
      return res.status(500).json({ message: "FREEMIUM plan missing. Run migration." });
    }

    const sub = await UserSubscription.create({
      subscriptionId: uuidv4(),
      userid,
      planId: free.planId,
      status: "active",
      billingCycle: "monthly",
      startDate: new Date()
    });

    res.status(201).json({
      message: "Personal freemium subscription initialized",
      subscription: sub
    });

  } catch (err) {
    res.status(500).json({
      message: "Internal Server Error",
      error: err.message
    });
  }
});


// ---------------------------------------------------------------------------
// GET PERSONAL SUBSCRIPTION
// ---------------------------------------------------------------------------
/**
 * @swagger
 * /api/subscriptions/user/my-subscription:
 *   get:
 *     summary: Get the authenticated user's personal subscription
 *     tags: [User Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription returned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subscription:
 *                   $ref: '#/components/schemas/UserSubscription'
 *                 plan:
 *                   $ref: '#/components/schemas/Plan'
 *       404:
 *         description: No subscription found.
 *       500:
 *         description: Internal error.
 */
router.get("/my-subscription", authenticateToken, async (req, res) => {
  try {
    const { userid } = req.user;

    const { sub, plan } = await getUserPlan(userid);
    return res.status(200).json({ subscription: sub, plan });

  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


// ---------------------------------------------------------------------------
// UPGRADE PERSONAL SUBSCRIPTION
// ---------------------------------------------------------------------------
/**
 * @swagger
 * /api/subscriptions/user/upgrade:
 *   post:
 *     summary: Upgrade the user's personal subscription
 *     description: Upgrades to a higher-tier active plan.
 *     tags: [User Subscriptions]
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
 *                 description: UUID of the new plan to upgrade to.
 *                 example: "d8a932ec-f45c-43c8-bf94-568ab0b0c045"
 *     responses:
 *       200:
 *         description: Subscription upgraded.
 *       404:
 *         description: Plan or subscription not found.
 *       500:
 *         description: Server error.
 */
router.post("/upgrade", authenticateToken, async (req, res) => {
  try {
    const { userid } = req.user;
    const { targetPlanId } = req.body;

    const plan = await Plan.findOne({ planId: targetPlanId, isActive: true });
    if (!plan) return res.status(404).json({ message: "Target plan not found." });

    const subscription = await UserSubscription.findOne({ userid });
    if (!subscription) return res.status(404).json({ message: "User has no subscription." });

    subscription.planId = plan.planId;
    subscription.status = "active";
    subscription.startDate = new Date();
    subscription.endDate = null;

    await subscription.save();

    res.status(200).json({
      message: "Subscription upgraded",
      subscription
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ---------------------------------------------------------------------------
// DOWNGRADE PERSONAL SUBSCRIPTION
// ---------------------------------------------------------------------------
/**
 * @swagger
 * /api/subscriptions/user/downgrade:
 *   post:
 *     summary: Downgrade the user's subscription
 *     tags: [User Subscriptions]
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
 *                 description: UUID of the new downgrade plan.
 *                 example: "fa7f8c41-05e4-4d52-bb57-bd0cff08f3aa"
 *     responses:
 *       200:
 *         description: Subscription downgraded.
 *       404:
 *         description: Plan or user subscription not found.
 *       500:
 *         description: Internal error.
 */
router.post("/downgrade", authenticateToken, async (req, res) => {
  try {
    const { userid } = req.user;
    const { targetPlanId } = req.body;

    const plan = await Plan.findOne({ planId: targetPlanId });
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    const subscription = await UserSubscription.findOne({ userid });
    if (!subscription) return res.status(404).json({ message: "Subscription not found" });

    subscription.planId = plan.planId;
    subscription.status = "active";
    subscription.startDate = new Date();
    subscription.endDate = null;

    await subscription.save();

    res.status(200).json({
      message: "Subscription downgraded",
      subscription
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ---------------------------------------------------------------------------
// CANCEL PERSONAL SUBSCRIPTION
// ---------------------------------------------------------------------------
/**
 * @swagger
 * /api/subscriptions/user/cancel:
 *   post:
 *     summary: Cancel the user's subscription
 *     tags: [User Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription cancelled.
 *       404:
 *         description: Subscription not found.
 *       500:
 *         description: Internal server error.
 */
router.post("/cancel", authenticateToken, async (req, res) => {
  try {
    const { userid } = req.user;

    const subscription = await UserSubscription.findOne({ userid });
    if (!subscription) return res.status(404).json({ message: "Subscription not found" });

    subscription.status = "cancelled";
    subscription.endDate = new Date();

    await subscription.save();

    res.status(200).json({
      message: "Subscription cancelled",
      subscription
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


//
// ============================================================================
// ORGANIZATION SUBSCRIPTION ROUTES
// ============================================================================
//

/**
 * @swagger
 * /api/subscriptions/org/my-org-subscription/{orgid}:
 *   get:
 *     summary: Get organization's subscription (Admin only)
 *     tags: [User Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: orgid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           example: "org-29a67111"
 *         description: The organization ID
 *     responses:
 *       200:
 *         description: Organization subscription returned.
 *       403:
 *         description: Unauthorized — not admin.
 *       404:
 *         description: Subscription not found.
 *       500:
 *         description: Internal error.
 */
router.get("/org/my-org-subscription/:orgid", authenticateToken, async (req, res) => {
  try {
    const { userid } = req.user;
    const { orgid } = req.params;

    const isAdmin = await verifyOrgAdmin(userid, orgid);
    if (!isAdmin) return res.status(403).json({ message: "Not authorized to view org subscription" });

    const sub = await OrgSubscription.findOne({ orgid });
    if (!sub) return res.status(404).json({ message: "Org subscription not found" });

    const plan = await Plan.findOne({ planId: sub.planId });

    return res.status(200).json({ subscription: sub, plan });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


/**
 * @swagger
 * /api/subscriptions/org/upgrade:
 *   post:
 *     summary: Upgrade an organization's subscription
 *     tags: [User Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orgid, targetPlanId]
 *             properties:
 *               orgid:
 *                 type: string
 *                 example: "org-92ff31ac"
 *               targetPlanId:
 *                 type: string
 *                 example: "6729e2ab-ef21-4cb4-83a4-90d9f79f187e"
 *     responses:
 *       200:
 *         description: Organization subscription upgraded.
 *       403:
 *         description: User is not org admin.
 *       404:
 *         description: Plan not found.
 *       500:
 *         description: Server error.
 */
router.post("/org/upgrade", authenticateToken, async (req, res) => {
  try {
    const { userid } = req.user;
    const { orgid, targetPlanId } = req.body;

    const isAdmin = await verifyOrgAdmin(userid, orgid);
    if (!isAdmin) return res.status(403).json({ message: "Not authorized" });

    const plan = await Plan.findOne({ planId: targetPlanId, isActive: true });
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    let sub = await OrgSubscription.findOne({ orgid });

    if (!sub) {
      sub = await OrgSubscription.create({
        subscriptionId: uuidv4(),
        orgid,
        planId: plan.planId,
        status: "active",
        billingCycle: "monthly",
        startDate: new Date()
      });
    } else {
      sub.planId = plan.planId;
      sub.status = "active";
      sub.startDate = new Date();
      sub.endDate = null;
    }

    await sub.save();

    res.status(200).json({
      message: "Organization subscription upgraded",
      subscription: sub
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


/**
 * @swagger
 * /api/subscriptions/org/cancel:
 *   post:
 *     summary: Cancel an organization's subscription
 *     tags: [User Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orgid]
 *             properties:
 *               orgid:
 *                 type: string
 *                 example: "org-fa12a2c1"
 *     responses:
 *       200:
 *         description: Organization subscription cancelled.
 *       403:
 *         description: Not authorized — not org admin.
 *       404:
 *         description: Subscription not found.
 *       500:
 *         description: Internal error.
 */
router.post("/org/cancel", authenticateToken, async (req, res) => {
  try {
    const { userid } = req.user;
    const { orgid } = req.body;

    const isAdmin = await verifyOrgAdmin(userid, orgid);
    if (!isAdmin) return res.status(403).json({ message: "Not authorized" });

    const subscription = await OrgSubscription.findOne({ orgid });
    if (!subscription) return res.status(404).json({ message: "Subscription not found" });

    subscription.status = "cancelled";
    subscription.endDate = new Date();

    await subscription.save();

    res.status(200).json({
      message: "Organization subscription cancelled",
      subscription
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
