const {telemetryQueue,statusQueue} = require("../../config/queue/bullMQ/bullqueue");
const { createMqttClient } = require("../../config/mqtt/mqtt_secure/mqtt_secure");

function initializeMQTTClient(client, topics) {
  client.on("connect", () => {
    console.log("🔗 Connected to MQTT broker");
 
    client.subscribe(topics, (err, granted) => {
      if (err) {
        console.error("❌ Subscription error:", err);
      } else {
        console.log(`✅ Subscribed to topics: ${topics.join(", ")}`);
        console.log("📜 Granted:", granted.map(g => g.topic).join(", "));
      }
    });
  });

  client.on("message", async (topic, messageBuffer) => {
    const messageString = messageBuffer.toString();
    console.log(`📥 MQTT message received on '${topic}': ${messageString}`);

    try {
      const data = JSON.parse(messageString);

      // // Validate required fields if necessary
      // if (!data.deviceId || !data.temperature) {
      //   console.warn("⚠️ Skipping invalid telemetry payload:", data);
      //   return;
      // }

      const jobPayload = {
        ...data,
        topic,
        receivedAt: new Date().toISOString()
      };
//1
      const result = await telemetryQueue.add('processTelemetry', jobPayload, {
        removeOnComplete: true,
        removeOnFail: { age: 5 }, // auto-remove failed jobs 5s after final failure
        attempts: 2,              // retry up to 2 times
        backoff: {
          type: 'exponential',
          delay: 5000             // wait 5s, then 10s
        }
      });

      // const status = await statusQueue.add('deviceStatus', jobPayload, {
      //   removeOnComplete: true,
      //   removeOnFail: true, // keep failed jobs for manual review or retry logic
      // });

      console.log(`📦 Telemetry queued as Job ID: ${result.id}`);
      //console.log(`📦 Status queued as Job ID: ${status.id}`);

    } catch (error) {
      console.error("❌ Failed to parse or queue message:", error.message);
    }
  });

  client.on("error", (err) => {
    console.error("❌ MQTT connection error:", err.message);
    client.end();
  });

  client.on("close", () => {
    console.log("🔌 MQTT connection closed");
  });
}

function connectSecureMqtt() {
  const topics = [
    "eventroutes/Env-Telemetry-Dev"
    // Add more topics as needed
  ];

  const mqttClient = createMqttClient();
  initializeMQTTClient(mqttClient, topics);

  // Optional: Simulate test message after connection
  /*
  setTimeout(() => {
    mqttClient.publish("eventroutes/Env-Telemetry-Dev", JSON.stringify({
      deviceId: "test-sensor-001",
      temperature: 28.9,
      humidity: 75
    }));
  }, 3000);
  */
}

module.exports = { connectSecureMqtt };
