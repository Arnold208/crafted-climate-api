const { io } = require("socket.io-client");

const SERVER_URL = "https://cctelemetry-api-prod-c5b7aqawfxeybvbd.eastus-01.azurewebsites.net";
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyaWQiOiJGVU9KVTJHWDg2IiwiZW1haWwiOiJhcm5vbGQua2lta3BlQGFmcmlsb2dpY3NvbHV0aW9ucy5jb20iLCJ1c2VybmFtZSI6ImFybm9sZDIwOCIsInBsYXRmb3JtUm9sZSI6ImFkbWluIiwib3JnYW5pemF0aW9ucyI6WyJvcmctZTRjOTE5NWEtY2ViYy00NDFiLTgwYTEtY2FiYTUzZDk5NGE2Iiwib3JnLTY1NzQ5NDAwLTE4MWItNGQzMi1hODU1LWU2M2Y1ZDkwNzAyOCJdLCJjdXJyZW50T3JnYW5pemF0aW9uSWQiOiJvcmctZTRjOTE5NWEtY2ViYy00NDFiLTgwYTEtY2FiYTUzZDk5NGE2IiwiaWF0IjoxNzcxMzQ2NzI5LCJleHAiOjE3NzEzODI3Mjl9.hv47dX2pBmIdKz5vWoPr-qqwwf0qjiuX2ZADLAVy6Ec"

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
