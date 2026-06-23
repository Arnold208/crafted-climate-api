const { Worker } = require('bullmq');
const pushService  = require('../services/push.service');

const connection = {
    host:                process.env.REDIS_HOST     || '127.0.0.1',
    port:                parseInt(process.env.REDIS_PORT || '6379', 10),
    password:            process.env.REDIS_PASSWORD || undefined,
    keepAlive:           30000,
    maxRetriesPerRequest: null,
};

/**
 * Push Notification Worker
 *
 * Processes queued FCM push jobs from the push_notifications BullMQ queue.
 *
 * ── Why a separate worker? ──────────────────────────────────────────────────
 * Sending to 50,000 users via FCM requires ~100 HTTP calls (500 tokens each).
 * Doing this synchronously inside an Express request would:
 *   • Block the event loop for seconds
 *   • Time out the HTTP request
 *   • Crash under concurrent admin actions
 *
 * This worker processes jobs asynchronously with controlled concurrency:
 *   concurrency: 5  → 5 jobs processed in parallel
 *   Each job:  up to 500 FCM tokens → 5 * 500 = 2,500 tokens per "tick"
 *
 * For 100,000 users (~100,000 tokens in 200 batch jobs of 500):
 *   ≈ 200 jobs / 5 concurrency = ~40 "ticks"
 *   FCM HTTP v1 limit: 600 msgs/s per project → no throttle needed at this scale
 */
class PushWorker {
    constructor() {
        this.worker = null;
    }

    async start() {
        if (this.worker) {
            console.log('[PushWorker] Already running');
            return;
        }

        console.log('[PushWorker] Starting...');

        this.worker = new Worker(
            'push_notifications',
            async (job) => {
                try {
                    return await pushService.processQueueJob(job);
                } catch (err) {
                    console.error(`[PushWorker] Job ${job.id} (${job.name}) error:`, err.message);
                    throw err; // Re-throw so BullMQ applies retry/back-off
                }
            },
            {
                connection,
                concurrency: 5,         // 5 parallel FCM batch calls
                limiter: {
                    max:      10,        // Max 10 jobs started per...
                    duration: 1000,      // ...1 second (safe for FCM quotas)
                },
            }
        );

        // ── Job lifecycle events ──────────────────────────────────────────────
        this.worker.on('completed', (job, result) => {
            console.log(
                `[PushWorker] ✅ Job ${job.id} (${job.name}) done —`,
                `sent=${result?.sent ?? '?'} failed=${result?.failed ?? '?'}`
            );
        });

        this.worker.on('failed', (job, err) => {
            console.error(
                `[PushWorker] ❌ Job ${job?.id} (${job?.name}) failed after`,
                `${job?.attemptsMade ?? '?'} attempts: ${err.message}`
            );
        });

        this.worker.on('error', (err) => {
            console.error('[PushWorker] Worker error (Redis?):', err.message);
        });

        console.log('[PushWorker] Started ✅ (concurrency=5, limiter=10/s)');
    }

    async stop() {
        if (this.worker) {
            await this.worker.close();
            this.worker = null;
            console.log('[PushWorker] Stopped');
        }
    }
}

module.exports = new PushWorker();
