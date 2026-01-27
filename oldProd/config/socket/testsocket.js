const { io } = require("socket.io-client");

const SERVER_URL = "https://cctelemetry-api-prod-c5b7aqawfxeybvbd.eastus-01.azurewebsites.net";
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OGUyOWZhMzU2ZmQ4MjUyMGZkYmIxODMiLCJyb2xlIjoidXNlciIsInVzZXJpZCI6IjFWWTZLWEpGQUMiLCJlbWFpbCI6Imdlb3JnaW5hQHZlcnRldG93ZXIuY29tIiwidXNlcm5hbWUiOiJnZW9yZ2luYSIsImlhdCI6MTc2MzY4MzE4MCwiZXhwIjoxNzYzNjg2NzgwfQ.8Gt7R94dIRquUxmAEdn8oLvA-VHz2s2GBOHGQ7zAwkI"

const socket = io(SERVER_URL, {
  transports: ["websocket"],
  auth: { token: TOKEN },  
});

socket.on("connect", () => {
  console.log("✅ Connected to Realtime Server");
  socket.emit("join", "GH-YV91YJL2DIN_TWBS9W7AR", (ack) => {
    console.log("Join response:", ack);
  });
});

socket.on("telemetry", (data) => {
  console.log("📥 Telemetry update:", data);
});

socket.on("connect_error", (err) => {
  console.error("⚠️ Connection failed:", err.message);
});
