const { createMqttClient } = require("./mqtt_secure"); // ✅ This matches your export

console.log("🔍 Testing MQTT connection...");

try {
  const client = createMqttClient();

  client.on("connect", () => {
    console.log("✅ Successfully connected to MQTT broker.");
    process.exit(0); // optional
  });

  client.on("error", (err) => {
    console.error("❌ MQTT connection error:", err.message);
    process.exit(1); // optional
  });
} catch (error) {
  console.error("❌ Failed to create MQTT client:", error.message);
}
