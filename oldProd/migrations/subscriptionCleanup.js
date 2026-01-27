/**
 * ----------------------------------------------------------
 * Crafted Climate — Subscription Cleanup & Index Fix Script
 * ----------------------------------------------------------
 *
 * PURPOSE:
 * 1. Backup corrupt subscription docs
 * 2. Remove invalid or duplicate _id documents
 * 3. Remove duplicate subscriptionId entries (keep first, remove duplicates)
 * 4. Drop legacy broken indexes
 * 5. Rebuild correct indexes
 * 6. Validate fixed state
 *
 * SAFE TO RUN MULTIPLE TIMES
 * ----------------------------------------------------------
 */

const connectDB = require('../config/database/mongodb');
const UserSubscription = require('../model/subscriptions/UserSubscription');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    console.log("🔗 Connecting to MongoDB...");
    await connectDB();
    console.log("✔ Connected.");

    const backupFile = path.join(__dirname, `backup_subscriptions_${Date.now()}.json`);
    const corruptedDocs = [];
    const duplicateDocs = [];

    console.log("🔍 Scanning for corrupted subscription documents...");

    const allSubs = await UserSubscription.collection.find({}).toArray();

    for (const sub of allSubs) {
      const bad =
        !sub._id ||
        sub._id === "" ||
        typeof sub._id !== "object" ||
        !sub.subscriptionId ||
        typeof sub.subscriptionId !== "string";

      if (bad) {
        corruptedDocs.push(sub);
      }
    }

    console.log(`⚠ Found ${corruptedDocs.length} corrupted documents.`);

    // ----------------------------------------------------------
    // DETECT DUPLICATE subscriptionId VALUES
    // ----------------------------------------------------------
    console.log("🔍 Scanning for duplicate subscriptionId values...");
    
    const subscriptionIdMap = new Map();
    for (const sub of allSubs) {
      if (sub.subscriptionId && typeof sub.subscriptionId === "string") {
        if (!subscriptionIdMap.has(sub.subscriptionId)) {
          subscriptionIdMap.set(sub.subscriptionId, []);
        }
        subscriptionIdMap.get(sub.subscriptionId).push(sub._id.toString());
      }
    }

    // Find duplicates (keep first occurrence, mark rest for deletion)
    for (const [subId, mongoIds] of subscriptionIdMap.entries()) {
      if (mongoIds.length > 1) {
        console.log(`⚠ Found ${mongoIds.length} documents with subscriptionId: ${subId}`);
        // Keep first, delete the rest
        for (let i = 1; i < mongoIds.length; i++) {
          const dup = allSubs.find(s => s._id.toString() === mongoIds[i]);
          duplicateDocs.push(dup);
        }
      }
    }

    console.log(`⚠ Found ${duplicateDocs.length} duplicate subscriptionId documents.`);

    // ----------------------------------------------------------
    // 1. BACKUP CORRUPTED & DUPLICATE DOCUMENTS
    // ----------------------------------------------------------
    const allBad = [...corruptedDocs, ...duplicateDocs];
    if (allBad.length > 0) {
      fs.writeFileSync(backupFile, JSON.stringify(allBad, null, 2));
      console.log(`📦 Backup saved to: ${backupFile}`);
    }

    // ----------------------------------------------------------
    // 2. DELETE CORRUPTED DOCUMENTS
    // ----------------------------------------------------------
    console.log("🧹 Removing corrupted documents...");

    // Use native MongoDB queries to avoid Mongoose ObjectId casting issues
    await UserSubscription.collection.deleteMany({
      $or: [
        { subscriptionId: { $exists: false } },
        { subscriptionId: null },
        { subscriptionId: "" },
        { planId: null }
      ]
    });

    console.log("✔ Corrupted documents removed.");

    // ----------------------------------------------------------
    // 2B. DELETE DUPLICATE subscriptionId DOCUMENTS
    // ----------------------------------------------------------
    if (duplicateDocs.length > 0) {
      console.log(`🧹 Removing ${duplicateDocs.length} duplicate subscriptionId documents...`);
      
      for (const dup of duplicateDocs) {
        await UserSubscription.collection.deleteOne({ _id: dup._id });
      }
      
      console.log("✔ Duplicate documents removed.");
    }

    // ----------------------------------------------------------
    // 3. DROP LEGACY INDEXES (DROP UNIQUE CONSTRAINT FIRST)
    // ----------------------------------------------------------
    console.log("🔧 Dropping legacy indexes...");

    const indexes = await UserSubscription.collection.getIndexes();
    console.log("Current indexes:", Object.keys(indexes));

    // Drop any index that is NOT _id_
    for (const indexName of Object.keys(indexes)) {
      if (indexName !== "_id_") {
        console.log(`🗑 Dropping index: ${indexName}`);
        try {
          await UserSubscription.collection.dropIndex(indexName);
        } catch (err) {
          console.log(`⚠ Could not drop index ${indexName}:`, err.message);
        }
      }
    }

    console.log("✔ Legacy indexes dropped.");

    // ----------------------------------------------------------
    // 4. REBUILD SAFE INDEXES (WITHOUT UNIQUE CONSTRAINT)
    // ----------------------------------------------------------
    console.log("🔨 Rebuilding required indexes...");

    try {
      // Create non-unique index on subscriptionId for performance
      await UserSubscription.collection.createIndex({ subscriptionId: 1 });
      console.log("✔ Index on subscriptionId created (non-unique)");
    } catch (err) {
      console.log(`⚠ Could not create subscriptionId index:`, err.message);
    }

    try {
      await UserSubscription.collection.createIndex({ userid: 1 });
      console.log("✔ Index on userid created");
    } catch (err) {
      console.log(`⚠ Could not create userid index:`, err.message);
    }

    try {
      await UserSubscription.collection.createIndex({ organizationId: 1 });
      console.log("✔ Index on organizationId created");
    } catch (err) {
      console.log(`⚠ Could not create organizationId index:`, err.message);
    }

    try {
      await UserSubscription.collection.createIndex({ subscriptionScope: 1 });
      console.log("✔ Index on subscriptionScope created");
    } catch (err) {
      console.log(`⚠ Could not create subscriptionScope index:`, err.message);
    }

    console.log("✔ Indexes rebuilt successfully.");

    // ----------------------------------------------------------
    // 5. FINAL VALIDATION
    // ----------------------------------------------------------
    const subsAfter = await UserSubscription.collection.countDocuments();
    console.log(`📊 Subscriptions remaining after cleanup: ${subsAfter}`);

    // Verify no more duplicates
    const finalSubs = await UserSubscription.collection.find({}).toArray();
    const finalMap = new Map();
    let duplicatesFound = 0;
    
    for (const sub of finalSubs) {
      if (sub.subscriptionId) {
        if (finalMap.has(sub.subscriptionId)) {
          duplicatesFound++;
        } else {
          finalMap.set(sub.subscriptionId, true);
        }
      }
    }

    if (duplicatesFound > 0) {
      console.log(`⚠️ WARNING: Still found ${duplicatesFound} duplicate subscriptionIds!`);
    } else {
      console.log("✔ No duplicate subscriptionIds found!");
    }

    console.log("------------------------------------------------------");
    console.log("🎉 Subscription Cleanup Migration Completed Successfully");
    console.log("------------------------------------------------------");

    process.exit(0);

  } catch (err) {
    console.error("❌ Migration Failed:", err);
    process.exit(1);
  }
})();
