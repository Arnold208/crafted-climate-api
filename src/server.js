const app = require('./app');
const { setupRealtime } = require("./config/socket/socketio");
const connectDB = require('./config/database/mongodb');
const { connectRedis } = require('./config/redis/redis');
// MQTT Service
const secureMqtt = require('./modules/telemetry/mqtt.service');

// Workers (Refactored)
const { startTelemetryWorker } = require('./modules/telemetry/workers/telemetryWorker');
const { startStatusWorker } = require('./modules/telemetry/workers/statusWorker');
const { startSubscriptionWorker } = require('./modules/subscription/workers/subscriptionWorker');
const emailWorker = require('./workers/emailWorker');

// 🔥 PRODUCTION HARDENING: Queue monitoring for error visibility
const { QueueEvents } = require('bullmq');
const dotenv = require('dotenv');
const path = require('path');

let envFile = process.env.NODE_ENV === 'development' ? '.env.development' : '.env';
dotenv.config({ path: path.resolve(__dirname, `../${envFile}`) });

// Crons (Moved to src/cron)
const { startFlushDirectCron } = require('./cron/flushEnqueueCron');
const { startOfflineAlertCron } = require('./cron/offlineAlertCron');
const { startSubscriptionCheckCron } = require('./cron/subscriptionCheckCron');
const { startSLABreachCron } = require('./cron/slaBreachCron');

// 🔒 SECURITY: Validate required environment variables on startup
const requiredEnvVars = [
    'ACCESS_TOKEN_SECRET',
    'REFRESH_TOKEN_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_CALLBACK_URL',
    'DATABASE_NAME',
    'COSMOS_CONNECTION_STRING'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('Please check your .env file and ensure all required variables are set.');
    process.exit(1);
}

connectDB();

connectRedis()
    .then(() => {
        startTelemetryWorker();
        startStatusWorker();       // 🆕 Start status worker for heartbeats
        startSubscriptionWorker(); // 🆕 Start subscription worker
        startFlushDirectCron();
        startOfflineAlertCron();
        startSubscriptionCheckCron(); // 🆕 Start subscription cron
        startSLABreachCron(); // 🆕 Start SLA breach cron
        emailWorker.start().then(() => console.log('✅ Email worker started'));

        // 🔥 PRODUCTION HARDENING: Monitor queue for failed/stalled jobs
        const queueEvents = new QueueEvents('telemetry', {
            connection: {
                host: process.env.REDIS_HOST || '127.0.0.1',
                port: parseInt(process.env.REDIS_PORT || '6379', 10),
                password: process.env.REDIS_PASSWORD || undefined,
            }
        });

        queueEvents.on('failed', ({ jobId, failedReason }) => {
            console.error(`🚨 QUEUE FAILED | Job ID: ${jobId} | Reason: ${failedReason}`);
        });

        queueEvents.on('stalled', ({ jobId }) => {
            console.error(`⏸️ QUEUE STALLED | Job ID: ${jobId} | Worker may have crashed or timed out`);
        });

        console.log('✅ QueueEvents monitoring initialized for telemetry queue');

        const PORT = process.env.PORT || 3000;

        const server = app.listen(PORT, () => {
            console.log(`🚀 Server running at http://localhost:${PORT}`);
            console.log(`📘 Swagger docs available at http://localhost:${PORT}/climate-docs`);
        });

        setupRealtime(server);
    })
    .catch((err) => {
        console.error('❌ Failed to connect to Redis:', err);
        process.exit(1);
    });

secureMqtt.connectSecureMqtt();

// ============================================
// 🛡️ PROCESS SAFETY HANDLERS
// ============================================

process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 UNHANDLED REJECTION:', reason);
    // In production, you might want to log this to Sentry or similar
});

process.on('uncaughtException', (error) => {
    console.error('🚨 UNCAUGHT EXCEPTION:', error);
    // For uncaught exceptions, it is recommended to let the process crash and restart
    // to avoid inconsistent state, but log it first.
    process.exit(1);
});
