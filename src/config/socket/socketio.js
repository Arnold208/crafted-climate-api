const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { createAdapter } = require("@socket.io/redis-adapter");
const { client: redisClient } = require("../redis/redis");
const apiKeyService = require("../../services/apiKey.service");
const { checkDeviceAccessCompatibility } = require("../../middleware/devices/checkDeviceAccessCompatibility");
const RegisterDevice = require("../../models/devices/registerDevice");

const JWT_SECRET = process.env.ACCESS_TOKEN_SECRET;
let io;

function setupRealtime(server) {
  io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ["websocket"],
  });

  const pubClient = redisClient.duplicate();
  const subClient = redisClient.duplicate();

  Promise.all([pubClient.connect(), subClient.connect()])
    .then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      console.log("✅ Socket.IO Redis Adapter initialized");
    })
    .catch((err) => {
      console.error("❌ Socket.IO Redis Adapter failed:", err);
    });

  // 🛡️ DUAL AUTHENTICATION MIDDLEWARE
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      const apiKey = socket.handshake.auth?.apiKey || socket.handshake.query?.apiKey;

      if (!token && !apiKey) {
        return next(new Error("Authentication required."));
      }

      if (token) {
        // --- USER AUTHENTICATION (JWT) ---
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded.userid || !decoded.email) {
          return next(new Error("Invalid token payload."));
        }
        socket.user = {
          userid: decoded.userid,
          email: decoded.email,
          username: decoded.username || "User",
          platformRole: decoded.platformRole || "user",
          organization: decoded.organizations || [],
          currentOrganizationId: decoded.currentOrganizationId || null,
          type: 'user'
        };
        return next();
      }

      if (apiKey) {
        // --- DEVICE AUTHENTICATION (API KEY) ---
        const validKey = await apiKeyService.verifyApiKey(apiKey);
        if (!validKey) {
          return next(new Error("Invalid or expired API key."));
        }

        socket.device = {
          organizationId: validKey.organizationId,
          type: 'device',
          keyId: validKey.keyId
        };
        return next();
      }
    } catch (err) {
      console.error("Socket Auth Error:", err.message);
      next(new Error("Authentication failed."));
    }
  });

  io.on("connection", (socket) => {
    const isDevice = socket.device?.type === 'device';
    const identifier = isDevice ? `Device (Org: ${socket.device.organizationId})` : socket.user.username;

    console.log(`📡 Realtime connection: ${identifier}`);

    // --- JOIN ROOM (AUID) ---
    socket.on("join", async (auid, ack) => {
      if (!auid || typeof auid !== "string") {
        return ack?.({ ok: false, error: "Invalid AUID" });
      }

      try {
        const device = await RegisterDevice.findOne({ auid });
        if (!device) return ack?.({ ok: false, error: "Device not found" });

        // 🛡️ AUTHORIZATION CHECK
        if (isDevice) {
          // Device must belong to the organization that owns the API Key
          if (device.organizationId !== socket.device.organizationId) {
            return ack?.({ ok: false, error: "Unauthorized: Device doesn't belong to your organization." });
          }
        } else {
          // User must be owner/collaborator/org-member with view access
          const allowed = await checkDeviceAccessCompatibility({ user: socket.user, headers: {} }, device, 'org.devices.view');
          if (!allowed) {
            return ack?.({ ok: false, error: "Forbidden: You do not have access to this device." });
          }
        }

        socket.join(auid);
        console.log(`${identifier} joined room: ${auid}`);
        ack?.({ ok: true, room: auid });
      } catch (err) {
        ack?.({ ok: false, error: "Join failed" });
      }
    });

    // --- COMMAND HANDLING (Bi-directional) ---
    // User -> Device
    socket.on("command:send", async ({ auid, command }, ack) => {
      if (isDevice) return ack?.({ ok: false, error: "Devices cannot send commands." });

      try {
        const device = await RegisterDevice.findOne({ auid });
        if (!device) return ack?.({ ok: false, error: "Device not found" });

        // 🛡️ COMMAND AUTHORIZATION
        const allowed = await checkDeviceAccessCompatibility({ user: socket.user, headers: {} }, device, 'org.devices.control');
        if (!allowed) {
          return ack?.({ ok: false, error: "Unauthorized: You don't have control permissions for this device." });
        }

        // Emit to the AUID room - only the actual device and authorized users are here
        // We use 'command:receive' so devices can listen specifically for it
        socket.to(auid).emit("command:receive", { auid, command, from: socket.user.userid });

        console.log(`🎮 Command sent to ${auid} by ${socket.user.userid}:`, command);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: "Command failed" });
      }
    });

    // Device -> User (Live Telemetry via Socket)
    socket.on("telemetry:emit", async (payload, ack) => {
      if (!isDevice) return ack?.({ ok: false, error: "Only devices can emit telemetry." });

      // Payloads should usually come in with AUID if the socket manages multiple, 
      // but here we assume the device knows its AUID or identifies it in the payload.
      const auid = payload.auid;
      if (!auid) return ack?.({ ok: false, error: "Missing AUID in payload" });

      // Verify the device actually owns this AUID (already checked on join, but safe to re-check room membership)
      if (!socket.rooms.has(auid)) {
        return ack?.({ ok: false, error: "Must join AUID room before emitting telemetry." });
      }

      // Broadcast to authorized users in the room
      socket.to(auid).emit("telemetry", payload);
      ack?.({ ok: true });
    });

    socket.on("leave", (auid, ack) => {
      socket.leave(auid);
      ack?.({ ok: true });
    });

    socket.on("disconnect", (reason) => {
      console.log(`${identifier} disconnected: ${reason}`);
    });
  });

  console.log("✅ Crafted Climate Realtime Socket Server initialized");
  return io;
}

function publishToAUID(auid, data) {
  if (!io) return;
  io.to(auid).emit("telemetry", data);
}

module.exports = { setupRealtime, publishToAUID };
