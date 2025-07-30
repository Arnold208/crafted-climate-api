const { io } = require("socket.io-client");
const dotenv = require('dotenv');
const path = require('path');
 
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });

// Replace this with your actual local or deployed server
const SOCKET_SERVER_URL = process.env.WEB_PUBSUB_CONNECTION_STRING_CLIENT; 
const SENSOR_AUID = "sensor-2af3"; // Replace with a real AUID you use

const socket = io(SOCKET_SERVER_URL);

socket.on("connect", () => {
  console.log("✅ Connected to server:", socket.id);

  // Join a sensor room
  socket.emit("join", SENSOR_AUID);
  console.log(`📡 Subscribed to sensor: ${SENSOR_AUID}`);
});

socket.on("telemetry", (data) => {
  console.log("📥 Received telemetry update:");
  console.log(JSON.stringify(data, null, 2));
});

socket.on("disconnect", () => {
  console.log("❌ Disconnected from server");
});

socket.on("connect_error", (err) => {
  console.error("⚠️ Connection error:", err.message);
});
