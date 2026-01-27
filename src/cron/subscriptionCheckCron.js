/**
 * Subscription Check Cron Job
 * Runs daily at 9:00 AM UTC to check for:
 * 1. Expiring subscriptions (3 days before)
 * 2. Grace period subscriptions (daily reminders)
 * 3. Expired subscriptions (start grace period)
 */

const cron = require('node-cron');
const { subscriptionQueue } = require('../config/queue/bullMQ/bullqueue');
const UserSubscription = require('../models/subscriptions/UserSubscription');

let subscriptionCronJob;

function startSubscriptionCheckCron() {
    // Run daily at 9:00 AM UTC
    subscriptionCronJob = cron.schedule('0 9 * * *', async () => {
        console.log('🕐 Running daily subscription check...');

        try {
            // 1. Check for expiring subscriptions (3 days before)
            await subscriptionQueue.add('check-expiring-subscriptions', {}, {
                jobId: `check-expiring-${Date.now()}`,
            });

            // 2. Check for grace period subscriptions
            await subscriptionQueue.add('check-grace-period-subscriptions', {}, {
                jobId: `check-grace-${Date.now()}`,
            });

            // 3. Check for subscriptions that just expired (start grace period)
            const now = new Date();
            const justExpired = await UserSubscription.find({
                status: 'active',
                endDate: { $lte: now },
                billingCycle: { $ne: 'free' }
            });

            for (const subscription of justExpired) {
                await subscriptionQueue.add('start-grace-period', {
                    subscriptionId: subscription.subscriptionId
                });
            }

            console.log(`✅ Subscription check completed. Found ${justExpired.length} newly expired subscriptions.`);
        } catch (error) {
            console.error('❌ Subscription cron error:', error);
        }
    }, {
        scheduled: true,
        timezone: "UTC"
    });

    console.log('✅ Subscription check cron started (daily at 9:00 AM UTC)');
}

function stopSubscriptionCheckCron() {
    if (subscriptionCronJob) {
        subscriptionCronJob.stop();
        console.log('🛑 Subscription check cron stopped');
    }
}

module.exports = {
    startSubscriptionCheckCron,
    stopSubscriptionCheckCron,
};
