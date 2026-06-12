const { telemetryQueue, statusQueue } = require("../../config/queue/bullMQ/bullqueue");
const { createMqttClient } = require("../../config/mqtt/mqtt_secure/mqtt_secure");

function initializeMQTTClient(client, topics) {
    client.on("connect", () => {
        console.log("🔗 Connected to MQTT broker");

        // 🔒 HARDENING: Request QoS 1 to ensure at-least-once delivery
        client.subscribe(topics, { qos: 1 }, (err, granted) => {
            if (err) {
                console.error("❌ Subscription error:", err);
            } else {
                console.log(`✅ Subscribed to topics (QoS 1): ${topics.join(", ")}`);
                console.log("📜 Granted:", granted.map(g => `${g.topic} (QoS ${g.qos})`).join(", "));
            }
        });
    });

    client.on("message", async (topic, messageBuffer) => {
        const messageString = messageBuffer.toString();
        console.log(`📥 MQTT message received on '${topic}': ${messageString}`);

        try {
            const rawData = JSON.parse(messageString);

            // Auto-unwrap Blues Wireless Notehub event wrapper (e.g., "data.qo")
            let data = rawData;
            const notehubFileKey = Object.keys(rawData).find(k => k.endsWith('.qo'));
            if (notehubFileKey && typeof rawData[notehubFileKey] === 'object') {
                data = rawData[notehubFileKey];
                console.log(`📦 Unwrapped Notehub event from key '${notehubFileKey}'`);
            }

            const jobPayload = {
                ...data,
                topic,
                receivedAt: new Date().toISOString()
            };
            // 🔥 PRODUCTION HARDENING: Fire-and-forget job cleanup
            const result = await telemetryQueue.add('processTelemetry', jobPayload, {
                jobId: data.event || `${Date.now()}-${Math.random()}`,
                removeOnComplete: true,              // Delete immediately upon success
                removeOnFail: { age: 24 * 3600 },    // Keep failed jobs for 24h for debugging
                attempts: 3,                         // Retry up to 3 times
                backoff: {
                    type: 'exponential',
                    delay: 1000                      // Smart retries: 1s, 2s, 4s
                }
            });

            console.log(`📦 Telemetry queued as Job ID: ${result.id}`);

            // 🔥 HEARTBEAT: Also push to status queue for fast online detection
            // Note: devid is nested under data.body, not at the root of the Notehub payload
            const heartbeatDevid = data.body?.devid;
            if (heartbeatDevid) {
                await statusQueue.add('processStatus', {
                    body: { devid: heartbeatDevid }
                }, {
                    removeOnComplete: true,
                    removeOnFail: true
                });
            }

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
    let topics = [
        "eventroutes/Env-Telemetry-Dev",
        "eventroutes/Env-Telemetry",
        "eventroutes/Aqua-Telemetry",
        "eventroutes/GasSolo-Telemetry"
    ];

    if (process.env.MQTT_TOPICS) {
        topics = process.env.MQTT_TOPICS.split(",").map(t => t.trim()).filter(Boolean);
    }

    const mqttClient = createMqttClient();
    initializeMQTTClient(mqttClient, topics);
}

module.exports = { connectSecureMqtt };
