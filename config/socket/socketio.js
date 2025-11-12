/**
 * Crafted Climate | Realtime WebSocket Server
 * JWT-based authentication (using `userId` from token only)
 * Join/leave AUID rooms and broadcast telemetry updates.
 */

const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.ACCESS_TOKEN_SECRET ;
let io;

function setupRealtime(server) {
  io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ["websocket"],
  });

  // Authenticate socket connection using JWT
  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error("Missing authentication token."));

      // Verify and decode token
      const decoded = jwt.verify(token, JWT_SECRET);

      const userId = decoded.userId;
      const email = decoded.email;
      const username = decoded.username || "Unknown";
      const role = decoded.role || "user";

      if (!userId || !email) {
        return next(new Error("Invalid token payload: missing userId or email."));
      }

      // Attach limited user context (no sensitive info)
      socket.user = { username, role };
      next();
    } catch (err) {
      console.error("JWT verification failed:", err.message);
      next(new Error("Authentication failed."));
    }
  });

  // Handle new connections
  io.on("connection", (socket) => {
    const { username } = socket.user;
    console.log(`Realtime connection established for user: ${username}`);

    // Join a telemetry room (AUID)
    socket.on("join", (auid, ack) => {
      if (!auid || typeof auid !== "string") {
        return ack?.({ ok: false, error: "Invalid AUID" });
      }

      socket.join(auid);
      const roomSize = io.sockets.adapter.rooms.get(auid)?.size || 1;
      console.log(`${username} joined telemetry channel: ${auid} (${roomSize} clients).`);
      ack?.({ ok: true, room: auid, members: roomSize });
    });

    // Leave room
    socket.on("leave", (auid, ack) => {
      socket.leave(auid);
      console.log(`${username} left telemetry channel: ${auid}.`);
      ack?.({ ok: true });
    });

    // Handle disconnection
    socket.on("disconnect", (reason) => {
      console.log(`${username} disconnected: ${reason}`);
    });
  });

  console.log("Crafted Climate Realtime WebSocket Server initialized successfully.");
  return io;
}

// Broadcast telemetry updates to all clients in an AUID room
function publishToAUID(auid, data) {
  if (!io) {
    console.error("Socket.IO not initialized. Telemetry broadcast aborted.");
    return;
  }
  io.to(auid).emit("telemetry", data);
  console.log(`Telemetry broadcast → ${auid}`);
}

module.exports = { setupRealtime, publishToAUID };
