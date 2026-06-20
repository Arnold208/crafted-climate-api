'use strict';
/**
 * DEV-ONLY Test Helper Routes
 * ════════════════════════════
 * These endpoints ONLY exist in NODE_ENV=development.
 * They are NEVER loaded in production (app.js guards this).
 *
 * Provides test setup utilities:
 *   POST /api/test-helpers/force-verify  — auto-verify a user email
 *   POST /api/test-helpers/force-admin   — temporarily elevate a user to admin
 *   POST /api/test-helpers/force-plan    — set a plan directly on an org
 *   DELETE /api/test-helpers/cleanup/:email — delete a test user by email
 */

const router   = require('express').Router();
const User     = require('../../models/user/userModel');
const mongoose = require('mongoose');

// Guard: must be development
router.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
});

// POST /api/test-helpers/force-verify
router.post('/force-verify', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    const user = await User.findOneAndUpdate(
      { email },
      { $set: { verified: true, otp: 0 } },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: `User ${email} not found` });
    res.json({ success: true, message: `User ${email} verified`, userId: user.userid });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/test-helpers/force-admin
router.post('/force-admin', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    const user = await User.findOneAndUpdate(
      { email },
      { $set: { platformRole: 'admin', role: 'admin' } },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: `User ${email} not found` });
    res.json({ success: true, message: `User ${email} elevated to admin`, userId: user.userid });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/test-helpers/force-user-role
router.post('/force-user-role', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    const user = await User.findOneAndUpdate(
      { email },
      { $set: { platformRole: 'user', role: 'user' } },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: `User ${email} not found` });
    res.json({ success: true, message: `User ${email} restored to user role`, userId: user.userid });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/test-helpers/force-plan
router.post('/force-plan', async (req, res) => {
  try {
    const { orgId, plan } = req.body;
    if (!orgId || !plan) return res.status(400).json({ error: 'orgId and plan required' });

    const UserSubscription = require('../../models/subscriptions/UserSubscription');
    const Plan             = require('../../models/subscriptions/Plan');

    // 1. Find or create the target plan by name
    let targetPlan = await Plan.findOne({ name: new RegExp(`^${plan}$`, 'i'), isActive: true });
    if (!targetPlan) {
      // Plan doesn't exist in DB yet — create it using PLAN_FEATURES config
      const { PLAN_FEATURES } = require('../../config/planFeatures');
      const features = PLAN_FEATURES[plan.toLowerCase()] || { mrvEngine: true };
      targetPlan = await Plan.findOneAndUpdate(
        { name: plan },
        {
          $setOnInsert: {
            name:                 plan,
            description:          `${plan} plan (auto-created by test helper)`,
            priceMonthly:         0,
            priceYearly:          0,
            maxDevices:           features.maxDevices ?? null,
            maxDataRetentionDays: features.maxDataRetentionDays ?? 365,
            isActive:             true,
          },
        },
        { upsert: true, new: true }
      );
    }

    // 2. Update ALL existing subscriptions for this org to the target plan
    //    (getUserPlan finds by organizationId without scope filter — must update all)
    const updateResult = await UserSubscription.updateMany(
      { organizationId: orgId, status: 'active' },
      { $set: { planId: targetPlan.planId, updatedAt: new Date() } }
    );

    // 3. If no existing subscription found, create one
    if (updateResult.matchedCount === 0) {
      await UserSubscription.create({
        userid:            'dev-test',
        organizationId:    orgId,
        subscriptionScope: 'organization',
        planId:            targetPlan.planId,
        status:            'active',
        billingCycle:      'monthly',
      });
    }

    res.json({
      success:   true,
      message:   `Org ${orgId} upgraded to "${targetPlan.name}" (planId=${targetPlan.planId})`,
      updated:   updateResult.modifiedCount,
      planName:  targetPlan.name,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// POST /api/test-helpers/force-manufacture
// Pre-seeds AddDevice (manufacturing) records so register-device can succeed in tests.
// Body: { devices: [{ serial, auid, model, devid }] }
router.post('/force-manufacture', async (req, res) => {
  try {
    const AddDevice = require('../../models/devices/addDevice');
    const { devices } = req.body;
    if (!Array.isArray(devices) || devices.length === 0)
      return res.status(400).json({ error: 'devices array required' });

    const results = [];
    for (const d of devices) {
      const { serial, auid, model, devid } = d;
      if (!serial) { results.push({ serial, status: 'SKIP: missing serial' }); continue; }
      try {
        await AddDevice.findOneAndUpdate(
          { serial },
          {
            $setOnInsert: {
              devid:          devid || serial,
              type:           'sensor',
              model:          model || 'gas-solo',
              // Hash the serial to 4 bytes → unique, stable, collision-free
              mac: (() => {
                let h = 2166136261;
                for (const c of serial) { h ^= c.charCodeAt(0); h = (h * 16777619) >>> 0; }
                return [
                  0xAA, 0xBB,
                  (h >>> 24) & 0xFF, (h >>> 16) & 0xFF, (h >>> 8) & 0xFF, h & 0xFF
                ].map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(':');
              })(),
              manufacturingId: `MFG-${serial}`,
              sku:            `SKU-${model || 'GAS-SOLO'}-DEV`,
              batchNumber:    'BATCH-DEV-2026-01',
              serial,
              auid:           auid || serial,
            },
          },
          { upsert: true, new: true }
        );
        results.push({ serial, auid, status: 'SEEDED' });
      } catch (e) {
        results.push({ serial, status: `ERROR: ${e.message}` });
      }
    }
    res.json({ success: true, results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/test-helpers/force-mrv-org
// Sets mrvEnabled=true on an organization so requireMRVFeatureEnabled passes in tests.
router.post('/force-mrv-org', async (req, res) => {
  try {
    const Organization = require('../../models/organization/organizationModel');
    const { orgId } = req.body;
    if (!orgId) return res.status(400).json({ error: 'orgId required' });
    const r = await Organization.findOneAndUpdate(
      { organizationId: orgId },
      { $set: { mrvEnabled: true } },
      { new: true }
    );
    if (!r) return res.status(404).json({ error: `Org ${orgId} not found` });
    res.json({ success: true, orgId, mrvEnabled: r.mrvEnabled });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


router.delete('/cleanup/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const result = await User.findOneAndDelete({ email });
    if (!result) return res.status(404).json({ error: `User ${email} not found` });
    res.json({ success: true, message: `Test user ${email} deleted`, userId: result.userid });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/test-helpers/cleanup-devices/:prefix
// Removes all AddDevice records whose serial starts with a given prefix.
router.delete('/cleanup-devices/:prefix', async (req, res) => {
  try {
    const AddDevice = require('../../models/devices/addDevice');
    const { prefix } = req.params;
    const r = await AddDevice.deleteMany({ serial: { $regex: `^${prefix}` } });
    res.json({ success: true, deleted: r.deletedCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
