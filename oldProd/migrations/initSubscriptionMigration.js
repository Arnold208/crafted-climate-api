/**
 * -----------------------------------------
 * Crafted Climate – Subscription Migration
 * -----------------------------------------
 * This migration:
 *  1. Creates Freemium, Premium, Enterprise plans
 *  2. Assigns freemium subscription to existing users
 *  3. Skips users who already have subscriptions
 * -----------------------------------------
 */

const connectDB = require('../config/database/mongodb');
const Plan = require('../model/subscriptions/Plan');
const UserSubscription = require('../model/subscriptions/UserSubscription');
const User = require('../model/user/userModel');
const { v4: uuidv4 } = require('uuid');

// Run in standalone environment
(async () => {
  try {
    console.log("Connecting to MongoDB...");
    await connectDB();
    console.log("✔ Connected.");

    console.log("----- Creating/Updating Plans -----");

    // ===============================
    // 1. CREATE FREEMIUM PLAN
    // ===============================
    let freemiumPlan = await Plan.findOne({ name: "freemium" });

    if (!freemiumPlan) {
      freemiumPlan = await Plan.create({
        planId: uuidv4(),
        name: "freemium",
        description: "Basic free plan with limited capabilities",
        priceMonthly: 0,
        priceYearly: 0,
        maxDevices: 5,
        maxDataRetentionDays: 1,
        maxDataExportMonths: 0,

        features: {
          device_read: true,
          device_update: false,
          collaboration: false,
          location_access: true,
          public_listing: false,
          export: false
        },

        isActive: true
      });

      console.log("✔ Freemium plan created.");
    } else {
      console.log("ℹ Freemium plan already exists. Skipping creation.");
    }

    // ===============================
    // 2. CREATE PREMIUM PLAN
    // ===============================
    let premiumPlan = await Plan.findOne({ name: "premium" });

    if (!premiumPlan) {
      premiumPlan = await Plan.create({
        planId: uuidv4(),
        name: "premium",
        description: "Full access to device features and improved data services",
        priceMonthly: 59,
        priceYearly: 600,
        maxDevices: 50,
        maxDataRetentionDays: 365,
        maxDataExportMonths: 12,

        features: {
          device_read: true,
          device_update: true,
          collaboration: true,
          location_access: true,
          public_listing: true,
          export: true
        },

        isActive: true
      });

      console.log("✔ Premium plan created.");
    } else {
      console.log("ℹ Premium plan already exists. Skipping creation.");
    }

    // ===============================
    // 3. CREATE ENTERPRISE PLAN
    // ===============================
    let enterprisePlan = await Plan.findOne({ name: "enterprise" });

    if (!enterprisePlan) {
      enterprisePlan = await Plan.create({
        planId: uuidv4(),
        name: "enterprise",
        description: "Unlimited access, AI insights, SLA, full support",
        priceMonthly: 299,
        priceYearly: 3000,
        maxDevices: -1,  // unlimited
        maxDataRetentionDays: -1,
        maxDataExportMonths: -1,

        features: {
          device_read: true,
          device_update: true,
          collaboration: true,
          location_access: true,
          public_listing: true,
          export: true
        },

        enterprise: {
          enableSLAs: true,
          dedicatedAccountManager: true,
          customDeployments: true
        },

        isActive: true
      });

      console.log("✔ Enterprise plan created.");
    } else {
      console.log("ℹ Enterprise plan already exists. Skipping creation.");
    }

    console.log("----- Assigning Freemium To Existing Users -----");

    const users = await User.find();

    for (const user of users) {
      const existingSub = await UserSubscription.findOne({ userid: user.userid });

      if (existingSub) {
        console.log(`→ User ${user.userid} already has subscription. Skipping.`);
        continue;
      }

      await UserSubscription.create({
        subscriptionId: uuidv4(),
        userid: user.userid,
        planId: freemiumPlan.planId,
        status: "active",
        billingCycle: "free",
        startDate: new Date(),
        endDate: null,
        autoRenew: false,
        usage: {
          devicesCount: 0,
          exportsThisMonth: 0,
          apiCallsThisMonth: 0
        }
      });

      console.log(`✔ Freemium subscription assigned to user: ${user.userid}`);
    }

    console.log("----- Migration Completed Successfully -----");
    process.exit(0);

  } catch (err) {
    console.error("❌ Migration Error:", err);
    process.exit(1);
  }
})();
