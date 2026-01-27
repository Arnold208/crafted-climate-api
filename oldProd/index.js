const app = require('./app'); // Import configured Express app
const { setupRealtime } = require("./config/socket/socketio");
const connectDB = require('./config/database/mongodb');
const { connectRedis } = require('./config/redis/redis');
const secureMqtt = require('./routes/telemetry/mqtt_secure_msg');

// Workers & Crons
const { startTelemetryWorker } = require('./routes/telemetry/queue_worker/telemetryWorker');
const { startStatusWorker } = require('./routes/telemetry/queue_worker/statusWorker');
const { startFlushDirectCron } = require('./cron/flushEnqueueCron');
const { startUpdateRedisStatusCron } = require('./cron/updateRedisStatusCron');

// Connect to MongoDB
// Note: dotenv is loaded inside app.js, so env vars are available here if we require app first.
connectDB();

// Connect Redis and Start Server
connectRedis()
  .then(() => {
    // Start Background Jobs
    startTelemetryWorker();
    startFlushDirectCron();
    startUpdateRedisStatusCron();
    // startStatusWorker(); // Optional/Commented out in original

    const PORT = process.env.PORT || 3000;

    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
      console.log(`📘 Swagger docs available at http://localhost:${PORT}/climate-docs`);
    });

    // Initialize Socket.io
    setupRealtime(server);
  })
  .catch((err) => {
    console.error('❌ Failed to connect to Redis:', err);
    process.exit(1);
  });

// Start MQTT Listener
secureMqtt.connectSecureMqtt();
