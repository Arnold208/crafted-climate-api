/**
 * Subscription Worker
 * Processes subscription lifecycle jobs from BullMQ
 * 
 * Job Types:
 * - check-expiring-subscriptions
 * - send-expiry-reminder
 * - start-grace-period
 * - check-grace-period-subscriptions
 * - send-grace-period-reminder
 * - end-grace-period
 */

const { Worker } = require('bullmq');
const subscriptionLifecycleService = require('../subscriptionLifecycle.service');

const connection = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
};

let subscriptionWorker;

function startSubscriptionWorker() {
    subscriptionWorker = new Worker(
        'subscriptions',
        async (job) => {
            console.log(`🔄 Processing subscription job: ${job.name} (ID: ${job.id})`);

            try {
                switch (job.name) {
                    case 'check-expiring-subscriptions':
                        await subscriptionLifecycleService.checkExpiringSubscriptions();
                        break;

                    case 'send-expiry-reminder':
                        const { subscriptionId: expirySubId, daysUntilExpiry } = job.data;
                        await subscriptionLifecycleService.sendExpiryReminder(expirySubId, daysUntilExpiry);
                        break;

                    case 'start-grace-period':
                        const { subscriptionId: graceSubId } = job.data;
                        await subscriptionLifecycleService.startGracePeriod(graceSubId);
                        break;

                    case 'check-grace-period-subscriptions':
                        await subscriptionLifecycleService.checkGracePeriodSubscriptions();
                        break;

                    case 'send-grace-period-reminder':
                        const { subscriptionId: reminderSubId, daysRemaining } = job.data;
                        await subscriptionLifecycleService.sendGracePeriodReminder(reminderSubId, daysRemaining);
                        break;

                    case 'end-grace-period':
                        const { subscriptionId: endSubId } = job.data;
                        await subscriptionLifecycleService.endGracePeriod(endSubId);
                        break;

                    default:
                        console.warn(`⚠️ Unknown job type: ${job.name}`);
                }

                console.log(`✅ Completed subscription job: ${job.name}`);
            } catch (error) {
                console.error(`❌ Subscription job failed: ${job.name}`, error);
                throw error; // Re-throw to trigger retry
            }
        },
        {
            connection,
            concurrency: 5, // Process 5 jobs concurrently
            limiter: {
                max: 10, // Max 10 jobs
                duration: 1000, // per second
            },
        }
    );

    subscriptionWorker.on('completed', (job) => {
        console.log(`✅ Subscription job ${job.id} completed`);
    });

    subscriptionWorker.on('failed', (job, err) => {
        console.error(`❌ Subscription job ${job?.id} failed:`, err.message);
    });

    subscriptionWorker.on('error', (err) => {
        console.error('❌ Subscription worker error:', err);
    });

    console.log('✅ Subscription worker started');
}

function stopSubscriptionWorker() {
    if (subscriptionWorker) {
        subscriptionWorker.close();
        console.log('🛑 Subscription worker stopped');
    }
}

module.exports = {
    startSubscriptionWorker,
    stopSubscriptionWorker,
};
