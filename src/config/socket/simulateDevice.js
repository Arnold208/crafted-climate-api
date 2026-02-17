const { io } = require("socket.io-client");

// --- CONFIGURATION ---
const SERVER_URL = "https://cctelemetry-api-prod-c5b7aqawfxeybvbd.eastus-01.azurewebsites.net"; // Update with your actual server URL
const API_KEY = "ck_live_0af5efa2_403ae10b1807a67d7fa1d82276bd912f8f4c0a32cce8e0d7f7cdc0bc339690c6";         // Replace with a valid API key
const AUID = "GH-Q50ZKMBMVMDJUHMFQQBIT";        // Replace with the device AUID

const socket = io(SERVER_URL, {
    auth: { apiKey: API_KEY },
    transports: ["websocket"]
});

socket.on("connect", () => {
    console.log("✅ Device connected successfully! Socket ID:", socket.id);

    // Join the AUID room - IMPORTANT: Must re-join on every reconnection
    socket.emit("join", AUID, (response) => {
        if (response.ok) {
            console.log(`🏠 Joined room: ${response.room}`);
        } else {
            console.error("❌ Join failed:", response.error);
        }
    });
});

socket.on("disconnect", (reason) => {
    console.warn("🔌 Disconnected from server:", reason);
    if (reason === "io server disconnect") {
        // the disconnection was initiated by the server, you need to reconnect manually
        socket.connect();
    }
    // else the socket will automatically try to reconnect
});

// Receive commands from users
socket.on("command:receive", (data) => {
    console.log("📥 Incoming command received:");
    console.log(JSON.stringify(data, null, 2));

    // Example: Echo success back or perform action
    if (data.command.pump !== undefined) {
        console.log(`Changing pump state to: ${data.command.pump}`);
    }
});

socket.on("connect_error", (err) => {
    console.error("❌ Connection error:", err.message);
});

socket.on("disconnect", (reason) => {
    console.log("🔌 Disconnected:", reason);
});

// Simulate sending telemetry every 10 seconds after joining
setInterval(() => {
    if (socket.connected) {
        const telemetry = {
            auid: AUID,
            tank_l: Math.floor(Math.random() * 500),
            flow_lpm: (Math.random() * 20).toFixed(2),
            pump: true,
            bat_v: 3.8,
            timestamp: Date.now()
        };

        socket.emit("telemetry:emit", telemetry, (ack) => {
            if (ack?.ok) {
                console.log("📤 Telemetry emitted successfully");
            } else {
                console.error("❌ Telemetry emission failed:", ack?.error);
            }
        });
    }
}, 10000);
