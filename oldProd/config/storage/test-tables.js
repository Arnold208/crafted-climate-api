/**
 * Quick Test for Azure Table Logging
 * ----------------------------------
 * Writes one log entry, then reads all logs
 * for partitionKey = "platform"
 */

const { writeAuditLog, tableClient } = require("./storage");
const { v4: uuidv4 } = require("uuid");

async function testAzureTable() {
  try {
    console.log("🔵 Writing test log...");

    const log = {
      partitionKey: "platform",
      rowKey: `${Date.now()}-${uuidv4()}`,
      userid: "test-user",
      route: "/test/azure/log",
      method: "GET",
      status: 200,
      timestamp: new Date().toISOString()
    };

    await writeAuditLog(log);

    console.log("✔ Log saved!");
    console.log("🔵 Fetching logs...");

    const logs = [];
    const entities = tableClient.listEntities({
      queryOptions: { filter: `PartitionKey eq 'platform'` }
    });

    for await (const entity of entities) logs.push(entity);

    console.log("📦 Retrieved Logs:");
    console.log(logs);

    console.log("🎉 Azure Table Storage test successful!");
  } catch (err) {
    console.error("❌ Azure Table Test Error:", err.message);
  }
}

testAzureTable();
