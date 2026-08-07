const { telemetryQueue, statusQueue } = require("../../config/queue/bullMQ/bullqueue");
const { createMqttClient } = require("../../config/mqtt/mqtt_secure/mqtt_secure");
const CacheService  = require("../common/cache.service");
const eventLog      = require("../devices/eventLog/eventLog.service");
const { client: redisClient } = require("../../config/redis/redis");

// ── Monitoring State Variables ──────────────────────────────────────────────
let isConnected = false;
let alertSent = false;
let disconnectTime = null;
let graceTimer = null;
let startupTimer = null;

// ── Batch config lookup: Redis-first, DB fallback ─────────────────────────────
// Reads device.batch (configured readings per batch) without making a DB call
// when the Redis cache is warm (which it is after the first telemetry from a device).
async function getDeviceBatchConfig(auid) {
    try {
        // Redis path: device:{auid}:meta contains the full device document (TTL: 24h)
        const cached = await CacheService.getOrSet(
            `device:${auid}:meta`,
            async () => {
                // DB fallback — only fires on a cold cache miss
                const Device = require("../../models/devices/registerDevice");
                return await Device.findOne({ auid }).select('batch frequency').lean();
            },
            86400 // 24h — matches existing TTL convention
        );
        if (cached && cached.batch != null) {
            return { batch: Number(cached.batch), frequency: Number(cached.frequency || 10), source: 'redis' };
        }
    } catch (err) {
        console.warn(`[BatchValidation] Cache lookup failed for ${auid}: ${err.message} — skipping validation`);
    }
    return null;
}

// ── Batch acknowledgement log ─────────────────────────────────────────────────
function logBatchReceipt(devid, batchSeq, received, expected) {
    const confirmed = expected == null || received === expected;
    const bar   = '═'.repeat(60);
    const icon  = confirmed ? '✅' : '⚠️ ';
    const label = confirmed ? 'CONFIRMED' : 'PARTIAL / MISMATCH';
    console.log(`\n${bar}`);
    console.log(`${icon} BATCH RECEIPT — ${label}`);
    console.log(`   Device    : ${devid}`);
    console.log(`   Batch #   : ${batchSeq}`);
    if (expected != null) {
        console.log(`   Received  : ${received} / ${expected} datapoints (configured: batch=${expected})`);
        if (!confirmed) {
            console.log(`   ⚠️  Possible causes: early flush, connectivity drop, firmware mismatch`);
        } else {
            console.log(`   Server has acknowledged receipt of all ${received} readings ✅`);
        }
    } else {
        console.log(`   Received  : ${received} datapoints (no device config found — skipping size validation)`);
    }
    console.log(`${bar}\n`);
}

function initializeMQTTClient(client, topics) {
    client.on("connect", () => {
        console.log("🔗 Connected to MQTT broker");

        // Reset tracking states
        isConnected = true;
        if (startupTimer) {
            clearTimeout(startupTimer);
            startupTimer = null;
        }
        if (graceTimer) {
            clearTimeout(graceTimer);
            graceTimer = null;
        }

        if (alertSent) {
            sendMqttAlert(false); // Send recovery alert
            alertSent = false;
        }
        disconnectTime = null;

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
        console.log(`📥 MQTT message received on '${topic}': ${messageString.slice(0, 200)}${messageString.length > 200 ? '…' : ''}`);

        try {
            const rawData = JSON.parse(messageString);

            // Auto-unwrap Blues Wireless Notehub event wrapper (e.g., "data.qo")
            let data = rawData;
            const notehubFileKey = Object.keys(rawData).find(k => k.endsWith('.qo'));
            if (notehubFileKey && typeof rawData[notehubFileKey] === 'object') {
                data = rawData[notehubFileKey];
                console.log(`📦 Unwrapped Notehub event from key '${notehubFileKey}'`);
            }

            // ── BATCH DETECTION ───────────────────────────────────────────────
            // A batch message has body.readings (array) and body.batch_size
            const isBatch = Array.isArray(data.body?.readings) && data.body?.batch_size != null;

            if (isBatch) {
                const devid      = data.body.devid;
                const batchSeq   = data.body.batch_seq;
                const received   = data.body.readings.length;
                const readings   = data.body.readings;

                // ── Redis-first batch size validation ─────────────────────────
                const config = await getDeviceBatchConfig(devid);
                const expected = config?.batch ?? null; // null = skip size validation

                logBatchReceipt(devid, batchSeq, received, expected);

                // ── Event log + degraded counter ──────────────────────────────
                const auid = config ? devid : devid; // devid === auid for gas-solo
                const isConfirmed = expected == null || received === expected;

                if (isConfirmed) {
                    // Reset degraded counter on confirmed batch
                    if (redisClient.isOpen) {
                        redisClient.del(`device:${auid}:consecutive_partials`).catch(() => {});
                    }
                    eventLog.batchConfirmed({ auid, devid, batchSeq, received, expected }).catch(() => {});
                } else {
                    // Increment degraded counter (TTL = 2× batch window; default 20 min)
                    let consecutivePartials = 1;
                    if (redisClient.isOpen) {
                        try {
                            consecutivePartials = await redisClient.incr(`device:${auid}:consecutive_partials`);
                            await redisClient.expire(`device:${auid}:consecutive_partials`, 1200);
                        } catch (_) { /* non-fatal */ }
                    }
                    // Write BATCH_MISMATCH log
                    eventLog.batchMismatch({ auid, devid, batchSeq, received, expected }).catch(() => {});

                    // If 2+ consecutive partials — write DEGRADED log
                    if (consecutivePartials >= 2) {
                        eventLog.degraded({ auid, devid, consecutivePartials, batchSeq }).catch(() => {});
                    }
                }

                // ── Fan out: each reading becomes its own telemetry job ────────
                let queued = 0;
                for (const reading of readings) {
                    // Re-wrap into the standard single-reading envelope
                    const singlePayload = {
                        body: {
                            devid,
                            devmod:          data.body.devmod,
                            time:            reading.time,
                            // Flat sensor fields
                            eco2:            reading.eco2,
                            tvoc:            reading.tvoc,
                            ch4:             reading.ch4,
                            co:              reading.co,
                            lpg_consumed_kg: reading.lpg_consumed_kg,
                            aqi:             reading.aqi,
                            comp_temp:       reading.comp_temp,
                            comp_humi:       reading.comp_humi,
                            voltage:         reading.voltage,
                            err_status:      reading.err_status,
                            // Nested body — required by MRV observation worker
                            body: {
                                eco2:            reading.eco2,
                                tvoc:            reading.tvoc,
                                ch4:             reading.ch4,
                                co:              reading.co,
                                lpg_consumed_kg: reading.lpg_consumed_kg,
                                aqi:             reading.aqi,
                                comp_temp:       reading.comp_temp,
                                comp_humi:       reading.comp_humi,
                            },
                            // Batch provenance metadata
                            batch_seq:     batchSeq,
                            reading_idx:   reading.reading_idx,
                        },
                        event:      `${data.event}-r${reading.reading_idx}`,
                        when:       reading.time,
                        topic,
                        receivedAt: new Date().toISOString(),
                        fromBatch:  true,
                    };

                    const jobId = singlePayload.event;
                    await telemetryQueue.add('processTelemetry', singlePayload, {
                        jobId,
                        removeOnComplete: true,
                        removeOnFail: { age: 24 * 3600 },
                        attempts: 3,
                        backoff: { type: 'exponential', delay: 1000 },
                    });
                    queued++;
                    console.log(`  📦 Queued reading ${reading.reading_idx}/${received}: Job ${jobId}`);
                }

                console.log(`✅ Batch #${batchSeq} fully queued — ${queued}/${received} jobs dispatched\n`);

                // Single heartbeat for the device
                if (devid) {
                    await statusQueue.add('processStatus', { body: { devid } }, {
                        removeOnComplete: true,
                        removeOnFail: true,
                    });
                }

            } else {
                // ── SINGLE MESSAGE (legacy / non-batch) ───────────────────────
                const jobPayload = {
                    ...data,
                    topic,
                    receivedAt: new Date().toISOString(),
                };

                const result = await telemetryQueue.add('processTelemetry', jobPayload, {
                    jobId: data.event || `${Date.now()}-${Math.random()}`,
                    removeOnComplete: true,
                    removeOnFail: { age: 24 * 3600 },
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 1000 },
                });

                console.log(`📦 Telemetry queued as Job ID: ${result.id}`);

                // 🔥 HEARTBEAT: fast online detection
                const heartbeatDevid = data.body?.devid;
                if (heartbeatDevid) {
                    await statusQueue.add('processStatus', {
                        body: { devid: heartbeatDevid }
                    }, {
                        removeOnComplete: true,
                        removeOnFail: true,
                    });
                }
            }

        } catch (error) {
            console.error("❌ Failed to parse or queue message:", error.message);
        }
    });

    const handleDisconnect = (reason) => {
        if (!isConnected) return; // Already offline

        isConnected = false;
        disconnectTime = disconnectTime || new Date();
        console.warn(`[MqttMonitor] MQTT connection lost (${reason}). Auto-retrying in background...`);

        if (!graceTimer) {
            graceTimer = setTimeout(async () => {
                if (!isConnected && !alertSent) {
                    alertSent = true;
                    await sendMqttAlert(true, reason);
                }
                graceTimer = null;
            }, 35000); // 35 seconds grace period (gives 3 retries at 10s intervals + buffer)
        }
    };

    client.on("error", (err) => {
        console.error("❌ MQTT connection error:", err.message);
        handleDisconnect(`Connection error: ${err.message}`);
    });

    client.on("close", () => {
        console.log("🔌 MQTT connection closed");
        handleDisconnect("Connection closed");
    });

    client.on("offline", () => {
        console.log("🔌 MQTT connection offline");
        handleDisconnect("Connection offline");
    });
}

// ── Alerting Utility ────────────────────────────────────────────────────────
async function sendMqttAlert(isDowntime, errorDetails = "") {
    const adminEmail = "arnold.kimkpe@afrilogicsolutions.com";
    const adminPhone = "+233505953242";
    
    // Import dynamically to avoid circular dependency / early load errors
    const { sendSMS } = require("../../config/sms/sms");
    const { sendCCEmail } = require("../../services/email/craftedClimateMailer");

    const timeZone = "Africa/Accra";
    const timeStr = new Date().toLocaleTimeString("en-US", { timeZone });
    const dateStr = new Date().toLocaleDateString("en-US", { timeZone });

    if (isDowntime) {
        const subject = `🚨 CRITICAL: MQTT Service Offline`;
        const message = `The MQTT Telemetry Service went offline on ${dateStr} at ${timeStr}. Error: ${errorDetails || 'Connection closed/lost'}. Immediate action is required to restore sensor operations.`;

        console.error(`[MqttMonitor] Sending downtime alert to ${adminEmail} and ${adminPhone}`);

        // 1. Send SMS
        try {
            await sendSMS(adminPhone, `CRITICAL ALERT: Crafted Climate MQTT service is OFFLINE since ${timeStr}. Error: ${errorDetails || 'Connection lost'}.`);
            console.log(`[MqttMonitor] Downtime SMS sent successfully.`);
        } catch (err) {
            console.error(`[MqttMonitor] Failed to send downtime SMS:`, err.message);
        }

        // 2. Send Email
        try {
            await sendCCEmail({
                type: 'notification.generic',
                to: adminEmail,
                vars: {
                    userName: 'Arnold Kimkpe',
                    title: subject,
                    message: message,
                    theme: 'critical',
                    category: 'System Alert',
                    transactional: true
                }
            });
            console.log(`[MqttMonitor] Downtime Email sent successfully.`);
        } catch (err) {
            console.error(`[MqttMonitor] Failed to send downtime Email:`, err.message);
        }
    } else {
        // Recovery
        const msDowntime = disconnectTime ? (new Date() - disconnectTime) : 0;
        const downtimeDuration = msDowntime > 0 ? formatDuration(msDowntime) : 'unknown duration';
        const subject = `✅ RESOLVED: MQTT Service Operational`;
        const message = `The MQTT Telemetry Service has recovered and is now online on ${dateStr} at ${timeStr}. Total downtime: ${downtimeDuration}.`;

        console.log(`[MqttMonitor] Sending recovery alert to ${adminEmail} and ${adminPhone}`);

        // 1. Send SMS
        try {
            await sendSMS(adminPhone, `RESOLVED: Crafted Climate MQTT service is back ONLINE at ${timeStr}. Downtime: ${downtimeDuration}.`);
            console.log(`[MqttMonitor] Recovery SMS sent successfully.`);
        } catch (err) {
            console.error(`[MqttMonitor] Failed to send recovery SMS:`, err.message);
        }

        // 2. Send Email
        try {
            await sendCCEmail({
                type: 'notification.generic',
                to: adminEmail,
                vars: {
                    userName: 'Arnold Kimkpe',
                    title: subject,
                    message: message,
                    theme: 'success',
                    category: 'System Alert',
                    transactional: true
                }
            });
            console.log(`[MqttMonitor] Recovery Email sent successfully.`);
        } catch (err) {
            console.error(`[MqttMonitor] Failed to send recovery Email:`, err.message);
        }
    }
}

function formatDuration(ms) {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    if (mins > 0) {
        return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
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

    // Startup check: alert if we don't connect within 35 seconds
    if (startupTimer) clearTimeout(startupTimer);
    startupTimer = setTimeout(async () => {
        if (!isConnected && !alertSent) {
            alertSent = true;
            await sendMqttAlert(true, "Startup connection timeout (failed to connect within 35s)");
        }
        startupTimer = null;
    }, 35000);
}

module.exports = { connectSecureMqtt };
