const dotenv = require('dotenv');
const path = require('path');

// LOAD ENV FIRST
let envFile = process.env.NODE_ENV === 'development' ? '.env.development' : '.env';
dotenv.config({ path: path.resolve(__dirname, `../${envFile}`) });

const { setupRealtime, startStatusBridge } = require("./config/socket/socketio");
const connectDB = require('./config/database/mongodb');
const { connectRedis } = require('./config/redis/redis');
// MQTT Service
const secureMqtt = require('./modules/telemetry/mqtt.service');

// Workers (Refactored)
const { startTelemetryWorker } = require('./modules/telemetry/workers/telemetryWorker');
const { startStatusWorker } = require('./modules/telemetry/workers/statusWorker');
const { startSubscriptionWorker } = require('./modules/subscription/workers/subscriptionWorker');
const emailWorker = require('./workers/emailWorker');
const alertWorker = require('./workers/alertWorker');
const webhookWorker = require('./workers/webhookWorker');

// ============================================================
// MRV ENGINE — Workers (parallel path, non-blocking)
// ============================================================
const { startMRVEvidenceWorker }       = require('./workers/mrv/mrvEvidenceWorker');
const { startMRVObservationWorker }    = require('./workers/mrv/mrvObservationWorker');
const { startMRVValidationWorker }     = require('./workers/mrv/mrvValidationWorker');
const { startMRVQualificationWorker }  = require('./workers/mrv/mrvQualificationWorker');
const { startMRVCalculationWorker }    = require('./workers/mrv/mrvCalculationWorker');
const { startMRVReportWorker }         = require('./workers/mrv/mrvReportWorker');
const { startMRVNotificationWorker }   = require('./workers/mrv/mrvNotificationWorker');
const { startMRVCompletenessWorker }   = require('./workers/mrv/mrvCompletenessWorker');
const { startMRVWebhookWorker }        = require('./workers/mrv/mrvWebhookWorker');

// 🔥 PRODUCTION HARDENING: Queue monitoring for error visibility
const { QueueEvents } = require('bullmq');

// Crons (Moved to src/cron)
const { startFlushDirectCron }      = require('./cron/flushEnqueueCron');
const { startOfflineAlertCron }     = require('./cron/offlineAlertCron');
const { startSubscriptionCheckCron }= require('./cron/subscriptionCheckCron');
const { startSLABreachCron }        = require('./cron/slaBreachCron');
const { startAutoDisableCron }      = require('./cron/autoDisableCron');
const { startResetApiQuotaCron }    = require('./cron/resetApiQuotaCron'); // 🔄 Monthly API quota reset

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
        // 🔥 LAZY LOAD APP: Ensure Redis is connected before loading app (and rate limiters)
        const app = require('./app');

        console.log('👷 Starting background workers...');
        startTelemetryWorker();
        startStatusWorker();       // 🆕 Start status worker for heartbeats
        startSubscriptionWorker(); // 🆕 Start subscription worker

        console.log('⏱️ Starting background crons...');
        startFlushDirectCron();
        startOfflineAlertCron();
        startSubscriptionCheckCron();
        startSLABreachCron();
        startAutoDisableCron(); // 🔄 Auto-disable devices inactive > 30 days
        startResetApiQuotaCron(); // 🔄 Reset monthly API call counters on 1st of month
        emailWorker.start().then(() => console.log('✅ Email worker started'));
        alertWorker.start().then(() => console.log('✅ Alert worker started'));
        webhookWorker.start().then(() => console.log('✅ Webhook worker started'));

        // ============================================================
        // MRV ENGINE — Start all workers (non-blocking try/catch)
        // MRV worker failures must never crash the operational server
        // ============================================================
        try {
            console.log('📊 Starting MRV Engine workers...');
            startMRVEvidenceWorker();
            startMRVObservationWorker();
            startMRVValidationWorker();
            startMRVQualificationWorker();
            startMRVCalculationWorker();
            startMRVReportWorker();
            startMRVNotificationWorker();
            startMRVCompletenessWorker();
            startMRVWebhookWorker();
            console.log('✅ All MRV Engine workers started');
        } catch (mrvWorkerErr) {
            console.error('❌ MRV Engine workers failed to start (operational path unaffected):', mrvWorkerErr.message);
        }

        // 🔥 Initialize Email Templates (Seeds DB)
        const emailTemplateService = require('./services/emailTemplate.service');
        emailTemplateService.initializeDefaults().catch(err => console.error('❌ Failed to init templates:', err.message));

        // ============================================================
        // MRV ENGINE — Seed Catalogue (standards, methodologies, sensor capabilities)
        // Runs AFTER MongoDB connection is confirmed ready (avoids Cosmos DB timeout race)
        // All entries are upserted (idempotent — safe to run on every restart)
        // ============================================================
        const mongoose = require('mongoose');
        const runMRVSeedWhenReady = () => {
            try {
                const { seedMRVCatalogue } = require('./services/mrv/mrvSeedService');
                const { ensureContainers } = require('./services/mrv/mrvBlobService');
                ensureContainers().catch(e => console.warn('[MRVBlob] Container ensure skipped:', e.message));
                seedMRVCatalogue();
            } catch (mrvSeedErr) {
                console.error('❌ MRV catalogue seed failed (non-fatal):', mrvSeedErr.message);
            }
        };

        if (mongoose.connection.readyState === 1) {
            // Already connected (e.g. hot reload) — run immediately
            runMRVSeedWhenReady();
        } else {
            // Wait for connection to be established before seeding
            mongoose.connection.once('connected', runMRVSeedWhenReady);
        }

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

        queueEvents.on('error', (error) => {
            console.error('❌ QueueEvents Error:', error);
        });

        console.log('✅ QueueEvents monitoring initialized for telemetry queue');

        const PORT = process.env.PORT || 3000;

        const server = app.listen(PORT, () => {
            console.log(`🚀 Server running at http://localhost:${PORT}`);
            console.log(`📘 Swagger docs available at http://localhost:${PORT}/climate-docs`);
        });

        setupRealtime(server);

        // ✅ START PUB/SUB BRIDGE: Redis device:status-change → Socket.IO rooms
        // This MUST be called after setupRealtime() so `io` is ready.
        startStatusBridge().catch(err =>
            console.error('❌ Failed to start status bridge:', err.message)
        );
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
