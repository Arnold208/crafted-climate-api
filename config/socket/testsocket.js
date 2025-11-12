const { io } = require("socket.io-client");

const SERVER_URL = "http://localhost:3000";
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OGUyOWZhMzU2ZmQ4MjUyMGZkYmIxODMiLCJyb2xlIjoidXNlciIsInVzZXJpZCI6IjFWWTZLWEpGQUMiLCJlbWFpbCI6Imdlb3JnaW5hQHZlcnRldG93ZXIuY29tIiwidXNlcm5hbWUiOiJnZW9yZ2luYSIsImlhdCI6MTc2Mjk3NTA5MywiZXhwIjoxNzYyOTc4NjkzfQ.v0SaT_OMh5Fj2qN0a8AYmf_8jLPYJCFoP_1xrlYyJFA"

const socket = io(SERVER_URL, {
  transports: ["websocket"],
  auth: { token: TOKEN }, // pass JWT here
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
