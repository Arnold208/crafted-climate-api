// 

const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { createAdapter } = require("@socket.io/redis-adapter");
const { client: redisClient } = require("../redis/redis");
const apiKeyService = require("../../services/apiKey.service");
const { checkDeviceAccessCompatibility } = require("../../middleware/devices/checkDeviceAccessCompatibility");
const RegisterDevice = require("../../models/devices/registerDevice");
const { nanoid } = require("nanoid");
const { telemetryQueue, statusQueue, subscriptionQueue } = require("../queue/bullMQ/bullqueue");
const logger = require("../../utils/logger");

const JWT_SECRET = process.env.ACCESS_TOKEN_SECRET;
let io;
let statusBridgeStarted = false;

function setupRealtime(server) {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    // Removing strict transport restrictions to allow defaults (polling, websocket)
    allowEIO3: true, // Critical: ESP32 SocketIOclient library often speaks EIO=3
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 45000
  });


  io.engine.on("connection_error", (err) => {
    console.error("❌ Engine connection error - Code:", err.code, "Message:", err.message);
  });

  // ─── REDIS ADAPTER ────────────────────────────────────────────────────────
  const pubClient = redisClient.duplicate();
  const subClient = redisClient.duplicate();

  pubClient.on("error", (err) => {
    console.error("❌ Socket.IO Redis Adapter pubClient Error:", err.message);
  });
  subClient.on("error", (err) => {
    console.error("❌ Socket.IO Redis Adapter subClient Error:", err.message);
  });

  Promise.all([pubClient.connect(), subClient.connect()])
    .then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      console.log("✅ Socket.IO Redis Adapter initialized");
    })
    .catch((err) => {
      console.error("❌ Socket.IO Redis Adapter failed:", err);
    });

  // ─── DUAL AUTHENTICATION MIDDLEWARE ───────────────────────────────────────
  io.use(async (socket, next) => {

    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token || socket.handshake.headers['authorization'];
      const apiKey = socket.handshake.auth?.apiKey || socket.handshake.query?.apiKey || socket.handshake.headers['x-api-key'] || socket.handshake.headers['apikey'];

      if (!token && !apiKey) {
        console.warn("⚠️  Auth failed: no token or apiKey present");
        return next(new Error("Authentication required."));
      }

      if (token) {
        // ── USER AUTHENTICATION (JWT) ──
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
          type: "user",
        };
        return next();
      }

      if (apiKey) {
        const validKey = await apiKeyService.verifyApiKey(apiKey);
        if (!validKey) {
          console.warn(`⚠️ [Socket ${socket.id}] Auth failed: invalid or expired API key`);
          return next(new Error("Invalid or expired API key."));
        }

        // Check subscription tier and limits on handshake
        const getUserPlan = require('../../middleware/subscriptions/getUserPlan');
        const { plan, sub } = await getUserPlan(validKey.createdBy, validKey.organizationId);

        if (!plan.features.websockets) {
            console.warn(`⚠️ [Socket ${socket.id}] Auth failed: WebSockets blocked on plan.`);
            return next(new Error("WebSockets access is not included in your current subscription plan."));
        }

        if (plan.features.apiAccess === 'limited') {
            const maxCalls = plan.features.maxApiCallsPerMonth || 1000;
            if (sub.usage && sub.usage.apiCallsThisMonth >= maxCalls) {
                console.warn(`⚠️ [Socket ${socket.id}] Auth failed: API limit reached.`);
                return next(new Error("Monthly API call limit reached for your plan."));
            }
        }

        // Increment API usage counter on successful socket connection
        const UserSubscription = require('../../models/subscriptions/UserSubscription');
        await UserSubscription.updateOne(
            { organizationId: validKey.organizationId, status: 'active' },
            { $inc: { 'usage.apiCallsThisMonth': 1 } }
        ).catch(e => console.error("Failed to increment API usage on socket connection:", e));

        socket.apiKey = {
          keyId: validKey.keyId,
          organizationId: validKey.organizationId,
          permissions: validKey.permissions || [],
          createdBy: validKey.createdBy
        };

        // Mock socket.user for compatibility with collaborators check
        socket.user = {
          userid: validKey.createdBy,
          organization: [validKey.organizationId],
          currentOrganizationId: validKey.organizationId,
          platformRole: 'user',
          role: 'user',
          type: 'api_client'
        };

        // Maintain fallback for existing checks
        socket.device = {
          organizationId: validKey.organizationId,
          type: "device",
          keyId: validKey.keyId,
        };

        return next();
      }

      // If we reach here, neither token nor apiKey matched
      console.warn(`⚠️ [Socket ${socket.id}] Auth fall-through: No valid credentials found`);
      return next(new Error("Authentication failed."));
    } catch (err) {
      console.error(`❌ [Socket ${socket.id}] Socket Auth Error:`, err.stack);
      next(new Error("Authentication failed. " + err.message));
    }
  });

  // ─── CONNECTION HANDLER ───────────────────────────────────────────────────
  io.on("connection", (socket) => {

    const isDevice = socket.device?.type === "device" && !socket.apiKey;
    const identifier = socket.apiKey
      ? `API Client (Key: ${socket.apiKey.keyId})`
      : isDevice
        ? `Device (Org: ${socket.device.organizationId})`
        : (socket.user?.username || "Unknown User");


    // ── JOIN ROOM (AUID) ──
    socket.on("join", async (auid, ack) => {
      if (!auid || typeof auid !== "string") {
        return ack?.({ ok: false, error: "Invalid AUID" });
      }

      try {
        const device = await RegisterDevice.findOne({ auid });
        if (!device) {
          console.warn(`Join failed: device ${auid} not found`);
          return ack?.({ ok: false, error: "Device not found" });
        }

        if (socket.apiKey) {
          if (String(device.organizationId) !== String(socket.apiKey.organizationId)) {
            console.warn(`Join denied: device org mismatch for API key`);
            return ack?.({ ok: false, error: "Unauthorized: Device doesn't belong to your organization." });
          }
          const hasJoinPermission = socket.apiKey.permissions.some(p =>
            ['telemetry:read', 'devices:read', 'telemetry:write', 'devices:write'].includes(p)
          );
          if (!hasJoinPermission) {
            console.warn(`Join denied: API key lacks required permissions`);
            return ack?.({ ok: false, error: "Forbidden: API key lacks required permissions." });
          }
        } else if (isDevice) {
          if (String(device.organizationId) !== String(socket.device.organizationId)) {
            console.warn(`Join denied: device org mismatch`);
            return ack?.({ ok: false, error: "Unauthorized: Device doesn't belong to your organization." });
          }
        } else {
          // User: Fetch collaborator context dynamically
          const Organization = require("../../models/organization/organizationModel");
          const CacheService = require("../../modules/common/cache.service");
          const orgId = device.organizationId;
          
          if (!orgId) {
            return ack?.({ ok: false, error: "Device has no organization context." });
          }

          const cacheKey = `org:${orgId}:meta`;
          const organization = await CacheService.getOrSet(cacheKey, async () => {
            return await Organization.findOne({ organizationId: orgId, deletedAt: null });
          }, 3600);

          if (!organization) {
            return ack?.({ ok: false, error: "Device organization not found." });
          }

          const membership = organization.collaborators.find(
            c => c.userid === socket.user.userid
          );

          if (!membership) {
            return ack?.({ ok: false, error: "Forbidden: You do not belong to this organization." });
          }

          const mockReq = {
            user: socket.user,
            headers: { "x-org-id": orgId },
            orgMembership: membership
          };

          const allowed = await checkDeviceAccessCompatibility(
            mockReq,
            device,
            "org.devices.view"
          );
          if (!allowed) {
            return ack?.({ ok: false, error: "Forbidden: You do not have access to this device." });
          }
        }

        socket.join(auid);
        console.log(`✅ ${identifier} joined room: ${auid}`);

        // Protocol ACK for JS clients
        ack?.({ ok: true, room: auid });

        // Explicit event for IoT clients that don't track ACK IDs
        socket.emit("join:success", { ok: true, room: auid });

        // 🔥 Trigger 1: Push server time immediately on join
        socket.emit("time:sync", {
          timestamp: Math.floor(Date.now() / 1000)
        });
        console.log(`[Socket ${socket.id}] ⏱️ Time sync pushed on join for ${auid}`);
      } catch (err) {
        console.error("Join error:", err);
        ack?.({ ok: false, error: "Join failed" });
        socket.emit("join:fail", { ok: false, error: "Join failed" });
      }
    });

    // ── COMMAND: USER/API CLIENT → DEVICE ──
    socket.on("command:send", async ({ auid, command }, ack) => {
      if (isDevice) return ack?.({ ok: false, error: "Devices cannot send commands." });

      try {
        const device = await RegisterDevice.findOne({ auid });
        if (!device) return ack?.({ ok: false, error: "Device not found" });

        if (socket.apiKey) {
          if (String(device.organizationId) !== String(socket.apiKey.organizationId)) {
            return ack?.({ ok: false, error: "Unauthorized: Device does not belong to your organization." });
          }
          if (!socket.apiKey.permissions.includes('devices:write')) {
            return ack?.({ ok: false, error: "Unauthorized: API key lacks devices:write permission." });
          }
        } else {
          // User: Fetch collaborator context dynamically
          const Organization = require("../../models/organization/organizationModel");
          const CacheService = require("../../modules/common/cache.service");
          const orgId = device.organizationId;

          if (!orgId) {
            return ack?.({ ok: false, error: "Device has no organization context." });
          }

          const cacheKey = `org:${orgId}:meta`;
          const organization = await CacheService.getOrSet(cacheKey, async () => {
            return await Organization.findOne({ organizationId: orgId, deletedAt: null });
          }, 3600);

          if (!organization) {
            return ack?.({ ok: false, error: "Device organization not found." });
          }

          const membership = organization.collaborators.find(
            c => c.userid === socket.user.userid
          );

          if (!membership) {
            return ack?.({ ok: false, error: "Forbidden: You do not belong to this organization." });
          }

          const mockReq = {
            user: socket.user,
            headers: { "x-org-id": orgId },
            orgMembership: membership
          };

          const allowed = await checkDeviceAccessCompatibility(
            mockReq,
            device,
            "org.devices.control"
          );
          if (!allowed) {
            return ack?.({ ok: false, error: "Unauthorized: You don't have control permissions." });
          }
        }

        socket.to(auid).emit("command:receive", {
          auid,
          command,
          from: socket.user.userid,
        });

        console.log(`🎮 Command sent to ${auid} by ${socket.user.userid}`);
        ack?.({ ok: true });
      } catch (err) {
        console.error("Command error:", err);
        ack?.({ ok: false, error: "Command failed" });
      }
    });

    // ── TELEMETRY: DEVICE/API CLIENT → USERS ──
    socket.on("telemetry:emit", async (payload, ack) => {
      const auid = payload?.auid;
      if (!auid) return ack?.({ ok: false, error: "Missing AUID in payload" });

      if (socket.apiKey) {
        if (!socket.apiKey.permissions.includes('telemetry:write')) {
          return ack?.({ ok: false, error: "Unauthorized: API key lacks telemetry:write permission." });
        }
      } else if (!isDevice) {
        return ack?.({ ok: false, error: "Only devices can emit telemetry." });
      }

      if (!socket.rooms.has(auid)) {
        console.warn(`Telemetry rejected: device not in room ${auid}`);
        return ack?.({ ok: false, error: "Must join AUID room before emitting telemetry." });
      }

      socket.to(auid).emit("telemetry", payload);
      console.log(`📊 Telemetry broadcast: ${auid}`);

      // 🔥 INTEGRATION: Hand off to BullMQ pipeline for metadata, caching, and batch flushing
      try {
        const device = await RegisterDevice.findOne({ auid });
        if (device) {
          const body = {
            devid: device.devid,
            devmod: device.model || 'FLOW',
            ...payload,
            ts: payload.timestamp || payload.ts || Date.now(),
          };

          const jobPayload = {
            body,
            transport: 'socketio',
            receivedAt: new Date().toISOString(),
            event: `sid_${nanoid(10)}` // Force uniqueness for Socket.io events
          };

          // Queue for processing (metadata + caching)
          await telemetryQueue.add('processTelemetry', jobPayload, {
            removeOnComplete: true,
            removeOnFail: { age: 24 * 3600 },
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 }
          });
          console.log(`📦 [BullMQ] Telemetry job added for ${device.devid}`);

          // Queue for status update (online flip)
          await statusQueue.add('processStatus', {
            body: { devid: device.devid }
          }, {
            removeOnComplete: true,
            removeOnFail: true
          });
          console.log(`🔔 [BullMQ] Status update job added for ${device.devid}`);
        }
      } catch (err) {
        console.error("❌ Socket.io Telemetry Queueing Error:", err.message);
      }

      ack?.({ ok: true });
    });

    // ── TIME SYNC: DEVICE REQUEST ──
    socket.on("time:request", (data) => {
      // Data might be [auid] or just auid string
      const auid = Array.isArray(data) ? data[0] : data;

      socket.emit("time:sync", {
        timestamp: Math.floor(Date.now() / 1000)
      });
      console.log(`[Socket ${socket.id}] ⏱️ Time sync sent on request (${auid || 'unknown AUID'})`);
    });

    // ── LEAVE ──
    socket.on("leave", (auid, ack) => {
      socket.leave(auid);
      console.log(`${identifier} left room: ${auid}`);
      ack?.({ ok: true });
    });

    // ── DISCONNECT ──
    socket.on("disconnect", (reason) => {
      console.log(`🔌 [Socket ${socket.id}] ${identifier} disconnected. Reason: ${reason}`);
    });
  });

  console.log("✅ Realtime Socket Server initialized");
  return io;
}

function publishToAUID(auid, data) {
  if (!io) return;
  io.to(auid).emit("telemetry", data);
}

function sendCommandToAUID(auid, command, from = 'system') {
  if (!io) return;
  console.log(`📡 [SocketIO] Sending command to ${auid}:`, JSON.stringify(command));
  io.to(auid).emit("command:receive", {
    auid,
    command,
    from
  });
}

/**
 * Pushes a status event directly into a device's Socket.IO room.
 * Called manually when needed (e.g., from REST endpoints).
 */
function publishStatusToSocket(auid, status, extra = {}) {
  if (!io) return;
  io.to(auid).emit("device:status", { auid, status, ...extra, ts: Date.now() });
  logger.info(`📡 [SocketBridge] Pushed status '${status}' to room ${auid}`);
}

/**
 * Starts the Redis Pub/Sub → Socket.IO bridge.
 *
 * node-redis v4 requires a *dedicated* duplicated client for subscribe mode.
 * This must be called AFTER setupRealtime() so that `io` is already set.
 */
async function startStatusBridge() {
  if (statusBridgeStarted) return;
  statusBridgeStarted = true;

  if (!io) {
    logger.error("[StatusBridge] io is not initialized. Call setupRealtime() first.");
    return;
  }

  // Create a dedicated subscriber client (cannot share with regular commands)
  const subClient = redisClient.duplicate();

  subClient.on("error", (err) =>
    logger.error("[StatusBridge] Redis subscriber error: %s", err.message)
  );

  try {
    await subClient.connect();

    await subClient.subscribe("device:status-change", async (message) => {
      try {
        const { auid, status, ...extra } = JSON.parse(message);
        if (!auid || !status) return;

        // Emit to all users/dashboards watching this device's room
        io.to(auid).emit("device:status", {
          auid,
          status,
          ...extra,
          ts: Date.now()
        });

        logger.info(`📡 [StatusBridge] Forwarded '${status}' for device ${auid} → Socket.IO room`);

        // Dispatch outgoing webhook events
        const webhookService = require("../../services/webhook.service");
        const device = await RegisterDevice.findOne({ auid });
        if (device && device.organizationId) {
          const eventType = status === 'online' ? 'device.online' : 'device.offline';
          webhookService.dispatch(device.organizationId, eventType, {
            auid,
            devid: device.devid,
            status,
            timestamp: new Date().toISOString()
          });
        }
      } catch (e) {
        logger.error("[StatusBridge] Failed to parse message or dispatch webhook: %s", e.message);
      }
    });

    logger.info("✅ [StatusBridge] Subscribed to 'device:status-change' channel");
  } catch (err) {
    logger.error("[StatusBridge] Failed to connect subscriber: %s", err.message);
    statusBridgeStarted = false; // Allow retry
  }
}

module.exports = { setupRealtime, publishToAUID, sendCommandToAUID, publishStatusToSocket, startStatusBridge };