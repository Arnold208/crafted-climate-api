const mongoose = require("mongoose");
require("dotenv").config({ path: "../.env.development" });

const { checkThresholds } = require("../../utils/thresholdEngine");

async function main() {
  try {
    console.log("Connecting to database...");

    await mongoose.connect(process.env.COSMOS_CONNECTION_STRING, {
      dbName: process.env.DATABASE_NAME,
      serverSelectionTimeoutMS: 15000
    });

    console.log("✅ MongoDB connected!");

    const auid ="";

    const simulatedData = {
      ec: 100
    };

    console.log("Running threshold check...");
    await checkThresholds(auid, simulatedData);

    console.log("Test completed.");

    await mongoose.connection.close();
    process.exit(0);

  } catch (err) {
    console.error("❌ Test Error:", err);
    process.exit(1);
  }
}

main();
