const { io } = require("socket.io-client");

// --- CONFIGURATION ---
const SERVER_URL = "http://localhost:3000"; // Update with your actual server URL
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyaWQiOiJGVU9KVTJHWDg2IiwiZW1haWwiOiJhcm5vbGQua2lta3BlQGFmcmlsb2dpY3NvbHV0aW9ucy5jb20iLCJ1c2VybmFtZSI6ImFybm9sZDIwOCIsInBsYXRmb3JtUm9sZSI6ImFkbWluIiwib3JnYW5pemF0aW9ucyI6WyJvcmctZTRjOTE5NWEtY2ViYy00NDFiLTgwYTEtY2FiYTUzZDk5NGE2Iiwib3JnLTY1NzQ5NDAwLTE4MWItNGQzMi1hODU1LWU2M2Y1ZDkwNzAyOCJdLCJjdXJyZW50T3JnYW5pemF0aW9uSWQiOiJvcmctZTRjOTE5NWEtY2ViYy00NDFiLTgwYTEtY2FiYTUzZDk5NGE2IiwiaWF0IjoxNzcxMzQ2NzI5LCJleHAiOjE3NzEzODI3Mjl9.hv47dX2pBmIdKz5vWoPr-qqwwf0qjiuX2ZADLAVy6Ec";       // Replace with a valid JWT token
const AUID = "GH-Q50ZKMBMVMDJUHMFQQBIT";      // Replace with the device AUID to monitor/control

const socket = io(SERVER_URL, {
    auth: { token: TOKEN },
    transports: ["websocket"]
});

socket.on("connect", () => {
    console.log("✅ User connected successfully! Socket ID:", socket.id);

    // Join the AUID room - IMPORTANT: Must re-join on every reconnection
    socket.emit("join", AUID, (response) => {
        if (response.ok) {
            console.log(`🏠 Subscribed to device: ${AUID}`);
        } else {
            console.error("❌ Subscription failed:", response.error);
        }
    });
});

socket.on("disconnect", (reason) => {
    console.warn("🔌 Disconnected from server:", reason);
    if (reason === "io server disconnect") {
        socket.connect();
    }
});

// Receive real-time telemetry from the device
socket.on("telemetry", (data) => {
    console.log("📊 Real-time telemetry received:");
    console.log(JSON.stringify(data, null, 2));
});

// Simulate sending a command every 15 seconds
let pumpState = true;
setInterval(() => {
    if (socket.connected) {
        pumpState = !pumpState; // Toggle state
        const command = { pump: pumpState };
        console.log(`📤 Sending command to ${AUID} (${pumpState ? 'ON' : 'OFF'}):`, command);

        socket.emit("command:send", { auid: AUID, command }, (ack) => {
            if (ack?.ok) {
                console.log("✅ Command acknowledged by server");
            } else {
                console.error("❌ Command failed:", ack?.error);
            }
        });
    }
}, 15000);

socket.on("connect_error", (err) => {
    console.error("❌ Connection error:", err.message);
});
