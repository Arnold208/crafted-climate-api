const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const connectDB = require('./config/database/mongodb');
const { connectRedis } = require('./config/redis/redis'); // ✅ Add this line

const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger/swaggerOptions');
const basicAuth = require('express-basic-auth');

const testRoutes = require('./routes/test');
const manufacturerRoutes = require('./routes/devices/manufacturer/manufacturer');
const users = require('./routes/user/user');
const { globalRateLimiter, swaggerRateLimiter } = require('./middleware/rateLimiter');
const sensorModels = require('./routes/devices/sensorModel/sensorModel');
const registerSensor = require('./routes/devices/user/userdevice');
const otaUpdate = require('./routes/devices/ota/ota');
const deployment = require('./routes/devices/deployment/deployment');
const telemetry = require('./routes/devices/telemetry/telemetry');

const secureMqtt = require('./routes/telemetry/mqtt_secure_msg');
const { setupSocket } = require("./config/socket/socketio");
const { startTelemetryWorker } = require('./routes/telemetry/queue_worker/telemetryWorker');
const { startStatusWorker } = require('./routes/telemetry/queue_worker/statusWorker');
const { startFlushDirectCron } = require('./cron/flushEnqueueCron');
const { startFlushWorker } = require('./routes/telemetry/queue_worker/flushWorker');
const app = express();

// Load environment variables
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: path.resolve(__dirname, envFile) });

// Connect to MongoDB
connectDB();

// Apply global rate limiting
app.use(globalRateLimiter);

// Parse incoming JSON
app.use(express.json());

// Swagger docs route (protected)
app.use(
  '/climate-docs',
  swaggerRateLimiter,
  basicAuth({
    users: { [process.env.SWAGGER_USERNAME]: process.env.SWAGGER_PASSWORD },
    challenge: true,
    unauthorizedResponse: (req) =>
      req.auth ? 'Credentials rejected' : 'No credentials provided',
  }),
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec)
);

secureMqtt.connectSecureMqtt();

// API Routes
app.use('/api', testRoutes);
app.use('/api/devices/manufacturer', manufacturerRoutes);
app.use('/api/auth', users);
app.use('/api/user', users);
app.use('/api/devices', sensorModels);
app.use('/api/devices', registerSensor);
app.use('/api/devices', otaUpdate);
app.use('/api/devices', deployment);
app.use('/api/telemetry', telemetry);

// ✅ Connect Redis before starting server
connectRedis()
  .then(() => {

    startTelemetryWorker();
    //startStatusWorker();
    startFlushDirectCron();
    const PORT = process.env.PORT || 3000;

    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
      console.log(`📘 Swagger docs available at http://localhost:${PORT}/climate-docs`);
    });

    setupSocket(server);
  })
  .catch((err) => {
    console.error('❌ Failed to connect to Redis:', err);
    process.exit(1); // Exit app if Redis fails
  });


