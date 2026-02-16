const { io } = require("socket.io-client");

// --- CONFIGURATION ---
const SERVER_URL = ""; // Update with your actual server URL
const TOKEN = "";       // Replace with a valid JWT token
const AUID = "";      // Replace with the device AUID to monitor/control

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
setInterval(() => {
    if (socket.connected) {
        const command = { pump: Math.random() > 0.5 }; // Randomly toggle pump
        console.log(`📤 Sending command to ${AUID}:`, command);

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

socket.on("disconnect", (reason) => {
    console.log("🔌 Disconnected:", reason);
});
