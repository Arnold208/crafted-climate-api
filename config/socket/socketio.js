const dotenv = require('dotenv');
const path = require('path');
const { Server } = require("socket.io");
const { useAzureSocketIO } = require("@azure/web-pubsub-socket.io");

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });

let io;
const sensorClients = {}; // Track clients connected by sensor AUID

function setupSocket(server) {
  // Initialize Socket.IO server
  io = new Server(server);

  // Integrate with Azure Web PubSub
  useAzureSocketIO(io, {
    hub: "Sensors", // The hub name
    connectionString: process.env.WEB_PUBSUB_CONNECTION_STRING, // Use connection string from .env
  });

  // Socket.IO connection
  io.on("connection", (socket) => {
    console.log("A client connected:", socket.id);

    // Join room based on sensor AUID
    socket.on("join", (sensorAUID) => {
      console.log(`Client ${socket.id} joined room: ${sensorAUID}`);
      socket.join(sensorAUID);

      // Track the client and the sensor AUID they are interested in
      sensorClients[socket.id] = sensorAUID;
    });

    // Handle client disconnection
    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
      delete sensorClients[socket.id];
    });
  });
}

// Function to emit data to specific rooms
function publishToSensor(sensorAUID, data) {
  if (io) {
    io.to(sensorAUID).emit("telemetry", data);
    console.log(sensorAUID, " Telemetry Published on SocketIO");
  } else {
    console.error("Socket.IO server is not initialized.");
  }
}

module.exports = { setupSocket, publishToSensor };
