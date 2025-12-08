// Quick test to verify organization creation now works
const connectDB = require('./config/database/mongodb');
const Organization = require('./model/organization/organizationModel');
const Plan = require('./model/Plan');
const UserSubscription = require('./model/subscriptions/UserSubscription');
const { v4: uuidv4 } = require('uuid');

(async () => {
  try {
    console.log("🔗 Connecting to MongoDB...");
    await connectDB();
    console.log("✔ Connected.");

    // Get or create a test plan
    let plan = await Plan.findOne({ planName: "Starter" });
    if (!plan) {
      console.log("⚠ No Starter plan found. Creating one...");
      plan = await Plan.create({
        planId: uuidv4(),
        planName: "Starter",
        planFeatures: ["basic"],
        pricing: { monthly: 9.99, yearly: 99.99 }
      });
      console.log("✔ Starter plan created:", plan.planId);
    } else {
      console.log("✔ Found Starter plan:", plan.planId);
    }

    // Create a test organization
    const testOrgId = uuidv4();
    const testUserId = uuidv4();

    console.log("\n📝 Creating test organization...");
    console.log("  Organization ID:", testOrgId);
    console.log("  User ID:", testUserId);
    console.log("  Plan ID:", plan.planId);

    const org = new Organization({
      organizationId: testOrgId,
      organizationName: "Test Org - " + Date.now(),
      ownerUserId: testUserId,
      isActive: true
    });

    await org.save();
    console.log("✔ Organization saved successfully");

    // Create subscription for the organization
    console.log("\n📝 Creating organization subscription...");
    
    const subscription = await UserSubscription.create({
      subscriptionId: uuidv4(),
      userid: testUserId,
      organizationId: testOrgId,
      subscriptionScope: "organization",
      planId: plan.planId,
      billingCycle: "monthly",
      status: "active"
    });

    console.log("✔ Subscription created successfully");
    console.log("  Subscription ID:", subscription.subscriptionId);
    console.log("  MongoDB _id:", subscription._id);

    console.log("\n🎉 Organization creation test PASSED!");
    process.exit(0);

  } catch (err) {
    console.error("❌ Test Failed:", err.message);
    console.error(err);
    process.exit(1);
  }
})();
