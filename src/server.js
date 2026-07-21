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
const emailWorker   = require('./workers/emailWorker');
const alertWorker   = require('./workers/alertWorker');
const webhookWorker = require('./workers/webhookWorker');
const pushWorker    = require('./workers/pushWorker');

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
const { registerWorker, registerWorkerFailure } = require('./services/workerRuntime.service');
const queueEventMonitors = [];

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

function startTrackedWorker(name, starter) {
    try {
        const worker = starter();
        registerWorker(name, worker);
        console.log(`[WorkerStartup] ${name} registered`);
        return worker;
    } catch (err) {
        registerWorkerFailure(name, err);
        console.error(`[WorkerStartup] ${name} failed to start:`, err.message);
        return null;
    }
}

function monitorQueueEvents(queueName) {
    const queueEvents = new QueueEvents(queueName, {
        connection: {
            host: process.env.REDIS_HOST || '127.0.0.1',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
            password: process.env.REDIS_PASSWORD || undefined,
        }
    });

    queueEvents.on('failed', ({ jobId, failedReason }) => {
        console.error(`[QueueEvents] failed | queue=${queueName} | job=${jobId} | reason=${failedReason}`);
    });

    queueEvents.on('stalled', ({ jobId }) => {
        console.error(`[QueueEvents] stalled | queue=${queueName} | job=${jobId} | worker may have crashed or timed out`);
    });

    queueEvents.on('error', (error) => {
        console.error(`[QueueEvents] error | queue=${queueName}:`, error.message);
    });

    queueEventMonitors.push(queueEvents);
    return queueEvents;
}

connectRedis()
    .then(() => {
        // Load app only after Redis is connected so rate limiters and sessions are ready.
        const app = require('./app');

        console.log('[WorkerStartup] Starting background workers...');
        startTrackedWorker('telemetry', startTelemetryWorker);
        startTrackedWorker('status', startStatusWorker);
        startTrackedWorker('subscriptions', startSubscriptionWorker);

        console.log('[CronStartup] Starting background crons...');
        startFlushDirectCron();
        startOfflineAlertCron();
        startSubscriptionCheckCron();
        startSLABreachCron();
        startAutoDisableCron();
        startResetApiQuotaCron();
        emailWorker.start().then(() => console.log('[WorkerStartup] Email worker started'));
        alertWorker.start().then(() => console.log('[WorkerStartup] Alert worker started'));
        webhookWorker.start().then(() => console.log('[WorkerStartup] Webhook worker started'));
        pushWorker.start().then(() => console.log('[WorkerStartup] Push notification worker started'));

        // ============================================================
        // MRV ENGINE - Start workers independently.
        // One failed worker must not prevent the rest of the MRV pipeline from running.
        // ============================================================
        console.log('[WorkerStartup] Starting MRV Engine workers...');
        startTrackedWorker('mrv-evidence', startMRVEvidenceWorker);
        startTrackedWorker('mrv-observation', startMRVObservationWorker);
        startTrackedWorker('mrv-validation', startMRVValidationWorker);
        startTrackedWorker('mrv-qualification', startMRVQualificationWorker);
        startTrackedWorker('mrv-calculation', startMRVCalculationWorker);
        startTrackedWorker('mrv-report', startMRVReportWorker);
        startTrackedWorker('mrv-notifications', startMRVNotificationWorker);
        startTrackedWorker('mrv-completeness', startMRVCompletenessWorker);
        startTrackedWorker('mrv-webhook', startMRVWebhookWorker);
        console.log('[WorkerStartup] MRV Engine worker startup attempted for all queues');

        const emailTemplateService = require('./services/emailTemplate.service');
        const mongoose = require('mongoose');
        const initEmailTemplates = () => {
            emailTemplateService.initializeDefaults()
                .then(() => console.log('[Startup] Email templates initialized'))
                .catch(err => console.error('[Startup] Failed to init templates:', err.message));
        };

        if (mongoose.connection.readyState === 1) {
            initEmailTemplates();
        } else {
            mongoose.connection.once('connected', initEmailTemplates);
        }

        const runMRVSeedWhenReady = () => {
            try {
                const { seedMRVCatalogue } = require('./services/mrv/mrvSeedService');
                const { ensureContainers } = require('./services/mrv/mrvBlobService');
                ensureContainers().catch(e => console.warn('[MRVBlob] Container ensure skipped:', e.message));
                seedMRVCatalogue();
            } catch (mrvSeedErr) {
                console.error('[Startup] MRV catalogue seed failed (non-fatal):', mrvSeedErr.message);
            }
        };

        if (mongoose.connection.readyState === 1) {
            runMRVSeedWhenReady();
        } else {
            mongoose.connection.once('connected', runMRVSeedWhenReady);
        }

        // Production queue monitoring: failed/stalled visibility for telemetry and MRV queues.
        [
            'telemetry',
            'mrv-evidence',
            'mrv-observation',
            'mrv-validation',
            'mrv-qualification',
            'mrv-completeness',
            'mrv-calculation',
            'mrv-report',
            'mrv-notifications',
            'mrv-webhook'
        ].forEach(monitorQueueEvents);

        console.log('[QueueEvents] Monitoring initialized for telemetry and MRV queues');

        const PORT = process.env.PORT || 3000;

        const server = app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
            console.log(`Swagger docs available at http://localhost:${PORT}/climate-docs`);
        });

        setupRealtime(server);

        startStatusBridge().catch(err =>
            console.error('[Startup] Failed to start status bridge:', err.message)
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
