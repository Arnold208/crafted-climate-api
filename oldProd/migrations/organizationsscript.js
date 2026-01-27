/**
 * ------------------------------------------------------
 * Crafted Climate — RBAC + Subscription Reset Script
 * ------------------------------------------------------
 * THIS SCRIPT REMOVES ONLY NEW TEST DATA:
 *  - Organizations created during testing
 *  - Deployments created during testing
 *  - UserSubscriptions created during RBAC migration
 *  - Devices linked to test organizations
 *  - Plans created during the migration (freemium/premium/enterprise)
 *
 * LEGACY DATA IS NOT TOUCHED.
 * ------------------------------------------------------
 */

const connectDB = require("../config/database/mongodb");

// MODELS
const Organization = require("../model/organization/");
const Deployment = require("../model/deployment/deploymentModel");
const UserSubscription = require("../model/subscriptions/UserSubscription");
const Plan = require("../model/subscriptions/Plan");
const Device = require("../model/devices/registerDevice");

(async () => {
  try {
    console.log("Connecting to MongoDB...");
    await connectDB();
    console.log("✔ Connected.");

    console.log("\n--------------------------------------------------");
    console.log("  STARTING SYSTEM CLEANUP (SAFE MODE)");
    console.log("--------------------------------------------------\n");

    // --------------------------------------------------------
    // 1. Remove Organizations created during testing
    // --------------------------------------------------------
    const deletedOrgs = await Organization.deleteMany({
      // ALL new orgs begin with "org-" + UUID
      organizationId: { $regex: /^org-/ }
    });
    console.log(`✔ Organizations removed: ${deletedOrgs.deletedCount}`);

    // --------------------------------------------------------
    // 2. Remove Deployments linked to these orgs
    // --------------------------------------------------------
    const deletedDeployments = await Deployment.deleteMany({
      organizationId: { $regex: /^org-/ }
    });
    console.log(`✔ Deployments removed: ${deletedDeployments.deletedCount}`);

    // --------------------------------------------------------
    // 3. Delete devices belonging to deleted organizations
    // --------------------------------------------------------
    const deletedDevices = await Device.deleteMany({
      organization: { $regex: /^org-/ }
    });
    console.log(`✔ Devices removed: ${deletedDevices.deletedCount}`);

    // --------------------------------------------------------
    // 4. Clear UserSubscriptions linked to test orgs
    // --------------------------------------------------------
    const deletedSubs = await UserSubscription.deleteMany({
      organizationId: { $regex: /^org-/ }
    });
    console.log(`✔ UserSubscriptions removed: ${deletedSubs.deletedCount}`);

    // --------------------------------------------------------
    // 5. Remove plans created during migration (optional)
    // --------------------------------------------------------
    const deletedPlans = await Plan.deleteMany({
      name: { $in: ["freemium", "premium", "enterprise"] }
    });
    console.log(`✔ Plans removed: ${deletedPlans.deletedCount}`);

    console.log("\n--------------------------------------------------");
    console.log("  CLEANUP COMPLETED SUCCESSFULLY");
    console.log("--------------------------------------------------\n");

    process.exit(0);

  } catch (err) {
    console.error("❌ RESET ERROR:", err);
    process.exit(1);
  }
})();
