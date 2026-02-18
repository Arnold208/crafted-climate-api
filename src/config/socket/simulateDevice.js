const { io } = require("socket.io-client");

// --- CONFIGURATION ---
const SERVER_URL = "http://localhost:3000"; // Update with your actual server URL
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

            // 🔥 Trigger 2: Explicitly request time sync after join confirmed
            console.log("⏱️ Requesting manual time sync...");
            socket.emit("time:request", AUID);
        } else {
            console.error("❌ Join failed:", response.error);
        }
    });
});

// ── TIME SYNC LISTENER ──
socket.on("time:sync", (data) => {
    console.log("🕒 [Time Sync Received]:", data);
    const serverTimestamp = data.timestamp;
    if (serverTimestamp > 1700000000) {
        console.log("✅ RTC update simulation: Clock synchronized with server UTC.");
    } else {
        console.warn("⚠️ Invalid timestamp received. RTC NOT updated.");
    }
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
let counter = 0;
setInterval(() => {
    if (socket.connected) {
        counter++;
        let telemetry = {
            auid: AUID,
            tank_mm: 220,
            tank_l: 16.80,
            tank_full: false,
            tank_empty: false,
            pump: false,
            manual: false,
            bat_v: 13.02,
            bat_ma: 44.10,
            bat_mw: 573.20,
            health: "0000",
            sensor_ok: true,
            sleeping: false,
            next_cycle: Math.floor(Date.now() / 1000) + 1800,
            timestamp: Math.floor(Date.now() / 1000),
            pump_session: null
        };

        // Cycle through scenarios
        const scenario = counter % 5;
        if (scenario === 1) { // Pump START
            telemetry.pump = true;
            telemetry.bat_v = 12.89;
            telemetry.bat_ma = 850.40;
            telemetry.bat_mw = 10962.00;
        } else if (scenario === 2) { // Pump STOP (with session summary)
            telemetry.timestamp += 60;
            telemetry.pump_session = {
                duration_s: 173,
                avg_ma: 854.20,
                avg_mw: 10891.00,
                min_v: 12.21,
                max_v: 12.89,
                samples: 17
            };
        } else if (scenario === 3) { // Going to sleep
            telemetry.sleeping = true;
            telemetry.next_cycle += 3600;
        } else if (scenario === 4) { // Health fault
            telemetry.tank_mm = 0;
            telemetry.tank_l = 0;
            telemetry.bat_v = 0.00;
            telemetry.bat_ma = 0.00;
            telemetry.bat_mw = 0.00;
            telemetry.health = "0110";
            telemetry.sensor_ok = false;
        }

        console.log(`📤 Emitting scenario ${scenario}:`, JSON.stringify(telemetry, null, 2));
        socket.emit("telemetry:emit", telemetry, (ack) => {
            if (ack?.ok) {
                console.log("✅ Telemetry emitted successfully");
            } else {
                console.error("❌ Telemetry emission failed:", ack?.error);
            }
        });
    }
}, 10000);
