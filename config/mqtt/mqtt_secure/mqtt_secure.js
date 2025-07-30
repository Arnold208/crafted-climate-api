
const mqtt = require("mqtt");
const fs = require("fs");
const path = require("path");
const dotenv = require('dotenv');

// Load correct .env file based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: path.resolve(__dirname, `../../../${envFile}`) });


// Resolve certificate paths
const certPath = path.resolve(__dirname, "../../certificates/api_v2-client.pem");
const keyPath  = path.resolve(__dirname, "../../certificates/api_v2-client.key");


// Base MQTT options
let options = {
  host: process.env.MQTT_SECURE_HOST,
  port: parseInt(process.env.MQTT_SECURE_PORT, 10) || 8883,
  protocol: process.env.MQTT_SECURE_PROTOCOL || "mqtts",
  rejectUnauthorized: process.env.MQTT_SECURE_REJECT_UNAUTHORIZED === "true",
  clientId: process.env.MQTT_SECURE_CLIENT_ID,
  keepalive: parseInt(process.env.MQTT_SECURE_KEEPALIVE, 10) || 60,
  connectTimeout: parseInt(process.env.MQTT_SECURE_CONNECT_TIMEOUT, 10) || 5000,
};

// Format PEM string from ENV
function formatPemString(pemString) {
  if (!pemString) return "";
  return pemString.replace(/\\n/g, "\n").trim();
}

// First try reading from files
try {
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    console.log("🔐 Using certificates from /certifacters folder");

    options.cert = fs.readFileSync(certPath);
    options.key = fs.readFileSync(keyPath);
    options.username = process.env.MQTT_SECURE_USERNAME;
    options.password = process.env.MQTT_SECURE_PASSWORD;
  } else {
    throw new Error("Certificate files not found");
  }
} catch (error) {
  console.warn("⚠️ Falling back to environment variables:", error.message);

  const certFromEnv = formatPemString(process.env.MQTT_CERT_CONTENT);
  const keyFromEnv = formatPemString(process.env.MQTT_KEY_CONTENT);


  if (certFromEnv && keyFromEnv) {
    options.cert = Buffer.from(certFromEnv, "utf-8");
    options.key = Buffer.from(keyFromEnv, "utf-8");
    options.username = process.env.MQTT_SECURE_USERNAME;
    options.password = process.env.MQTT_SECURE_PASSWORD;
    console.log("Loaded cert and key from environment variables");
  } else {
    console.error("No certificate credentials found");
  }
}

// Create and return an MQTT client
function createMqttClient() {
  return mqtt.connect(options);
}

module.exports = { createMqttClient };
