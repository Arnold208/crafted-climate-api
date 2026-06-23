'use strict';

/**
 * Subscription Lifecycle Management Service
 * Handles subscription expiry, grace periods, and freemium downgrades.
 *
 * Timeline:
 * - Day -3 to -1: Pre-expiry reminders  (subscription.expiry3/2/1)
 * - Day 0: Subscription expires         (subscription.graceStarted)
 * - Day +1 to +2: Grace period reminders (subscription.grace2, subscription.grace1)
 * - Day +3: Downgrade to freemium       (subscription.downgraded)
 *
 * All emails rendered by craftedClimateMailer using crafted_climate_email_templates.js:
 * table layout, CID logo, severity themes, and branded footer.
 */

const UserSubscription = require('../../models/subscriptions/UserSubscription');
const Plan = require('../../models/subscriptions/Plan');
const User = require('../../models/user/userModel');
const { sendCCEmail } = require('../../services/email/craftedClimateMailer');
const { subscriptionQueue } = require('../../config/queue/bullMQ/bullqueue');

class SubscriptionLifecycleService {

    /**
     * CHECK EXPIRING SUBSCRIPTIONS
     * Find subscriptions expiring in the next 3 days. Called daily by cron job.
     */
    async checkExpiringSubscriptions() {
        const now = new Date();
        const threeDaysFromNow = new Date(now);
        threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

        const expiringSubscriptions = await UserSubscription.find({
            status: 'active',
            endDate: { $lte: threeDaysFromNow, $gte: now },
            billingCycle: { $ne: 'free' },
        });

        console.log(`Found ${expiringSubscriptions.length} expiring subscriptions`);

        for (const subscription of expiringSubscriptions) {
            const daysUntilExpiry = this.calculateDaysUntilExpiry(subscription.endDate);
            if (this.shouldSendReminder(subscription, daysUntilExpiry)) {
                await subscriptionQueue.add('send-expiry-reminder', {
                    subscriptionId: subscription.subscriptionId,
                    daysUntilExpiry,
                });
            }
        }

        return { checked: expiringSubscriptions.length };
    }

    /**
     * SEND EXPIRY REMINDER (1, 2, or 3 days before expiry)
     */
    async sendExpiryReminder(subscriptionId, daysUntilExpiry) {
        const subscription = await UserSubscription.findOne({ subscriptionId });
        if (!subscription) return;

        const user = await User.findOne({ userid: subscription.userid });
        if (!user || !user.email) return;

        const plan = await Plan.findOne({ planId: subscription.planId });
        const planName = plan ? plan.name : 'Your Plan';

        // Map days remaining to email type
        const typeMap = { 1: 'subscription.expiry1', 2: 'subscription.expiry2', 3: 'subscription.expiry3' };
        const type = typeMap[daysUntilExpiry] || 'subscription.expiry1';

        await sendCCEmail({
            type,
            to: user.email,
            vars: {
                userName:    user.firstName || user.username || 'there',
                planName,
                expiryDate:  subscription.endDate ? subscription.endDate.toISOString() : undefined,
                renewalUrl:  `${process.env.APP_URL}/subscriptions`,
            },
        });

        subscription.lastReminderSentAt = new Date();
        subscription.reminderCount += 1;
        await subscription.save();

        console.log(`Sent expiry reminder to ${user.email} (${daysUntilExpiry} days)`);
    }

    /**
     * CHECK GRACE PERIOD SUBSCRIPTIONS. Called daily by cron job.
     */
    async checkGracePeriodSubscriptions() {
        const now = new Date();

        const gracePeriodSubscriptions = await UserSubscription.find({
            status: 'grace_period',
            gracePeriodEndDate: { $gte: now },
        });

        console.log(`Found ${gracePeriodSubscriptions.length} subscriptions in grace period`);

        for (const subscription of gracePeriodSubscriptions) {
            const daysRemaining = this.calculateDaysUntilExpiry(subscription.gracePeriodEndDate);

            if (this.shouldSendGracePeriodReminder(subscription)) {
                await subscriptionQueue.add('send-grace-period-reminder', {
                    subscriptionId: subscription.subscriptionId,
                    daysRemaining,
                });
            }

            if (daysRemaining <= 0) {
                await subscriptionQueue.add('end-grace-period', {
                    subscriptionId: subscription.subscriptionId,
                });
            }
        }

        return { checked: gracePeriodSubscriptions.length };
    }

    /**
     * START GRACE PERIOD — Transition expired subscription to grace period.
     */
    async startGracePeriod(subscriptionId) {
        const subscription = await UserSubscription.findOne({ subscriptionId });
        if (!subscription) return;

        const gracePeriodStart = new Date();
        const gracePeriodEnd = new Date(gracePeriodStart);
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 3);

        subscription.status = 'grace_period';
        subscription.gracePeriodStartDate = gracePeriodStart;
        subscription.gracePeriodEndDate = gracePeriodEnd;
        subscription.previousPlanId = subscription.planId;
        subscription.reminderCount = 0;
        await subscription.save();

        const user = await User.findOne({ userid: subscription.userid });
        if (user && user.email) {
            const plan = await Plan.findOne({ planId: subscription.planId });
            const planName = plan ? plan.name : 'Your Plan';

            await sendCCEmail({
                type: 'subscription.graceStarted',
                to: user.email,
                vars: {
                    userName:    user.firstName || user.username || 'there',
                    planName,
                    graceEndsAt: gracePeriodEnd.toISOString(),
                    renewalUrl:  `${process.env.APP_URL}/subscriptions`,
                },
            });
        }

        console.log(`Started grace period for subscription ${subscriptionId}`);
    }

    /**
     * SEND GRACE PERIOD REMINDER
     */
    async sendGracePeriodReminder(subscriptionId, daysRemaining) {
        const subscription = await UserSubscription.findOne({ subscriptionId });
        if (!subscription) return;

        const user = await User.findOne({ userid: subscription.userid });
        if (!user || !user.email) return;

        const plan = await Plan.findOne({ planId: subscription.previousPlanId || subscription.planId });
        const planName = plan ? plan.name : 'Your Plan';

        const typeMap = { 1: 'subscription.grace1', 2: 'subscription.grace2' };
        const type = typeMap[daysRemaining] || 'subscription.grace1';

        await sendCCEmail({
            type,
            to: user.email,
            vars: {
                userName:    user.firstName || user.username || 'there',
                planName,
                graceEndsAt: subscription.gracePeriodEndDate ? subscription.gracePeriodEndDate.toISOString() : undefined,
                renewalUrl:  `${process.env.APP_URL}/subscriptions`,
            },
        });

        subscription.lastReminderSentAt = new Date();
        subscription.reminderCount += 1;
        await subscription.save();

        console.log(`Sent grace period reminder to ${user.email} (${daysRemaining} days)`);
    }

    /**
     * END GRACE PERIOD — Downgrade to freemium.
     */
    async endGracePeriod(subscriptionId) {
        const subscription = await UserSubscription.findOne({ subscriptionId });
        if (!subscription) return;

        const freemiumPlan = await Plan.findOne({ name: 'freemium' });
        if (!freemiumPlan) {
            console.error('Freemium plan not found!');
            return;
        }

        const oldPlanId = subscription.planId;

        subscription.status = 'active';
        subscription.planId = freemiumPlan.planId;
        subscription.billingCycle = 'free';
        subscription.autoRenew = false;
        subscription.endDate = null;
        subscription.gracePeriodStartDate = null;
        subscription.gracePeriodEndDate = null;
        await subscription.save();

        // Reconcile device states under Freemium plan limit
        const reconcileDeviceStates = require('./reconcileDeviceStates');
        await reconcileDeviceStates(subscription.userid, subscription.organizationId, freemiumPlan.planId, 'system:downgrade');

        const user = await User.findOne({ userid: subscription.userid });
        if (user && user.email) {
            const oldPlan = await Plan.findOne({ planId: oldPlanId });
            const oldPlanName = oldPlan ? oldPlan.name : 'Premium Plan';

            await sendCCEmail({
                type: 'subscription.downgraded',
                to: user.email,
                vars: {
                    userName:    user.firstName || user.username || 'there',
                    planName:    oldPlanName,
                    renewalUrl:  `${process.env.APP_URL}/subscriptions`,
                },
            });
        }

        console.log(`Downgraded subscription ${subscriptionId} to freemium`);
    }

    /**
     * CANCEL GRACE PERIOD (Payment Received)
     */
    async cancelGracePeriod(subscriptionId, newEndDate) {
        const subscription = await UserSubscription.findOne({ subscriptionId });
        if (!subscription || subscription.status !== 'grace_period') return;

        subscription.status = 'active';
        subscription.endDate = newEndDate;
        subscription.gracePeriodStartDate = null;
        subscription.gracePeriodEndDate = null;
        subscription.lastReminderSentAt = null;
        subscription.reminderCount = 0;
        await subscription.save();

        console.log(`Cancelled grace period for subscription ${subscriptionId} - Renewed`);
    }

    // ── HELPER METHODS ───────────────────────────────────────────────────────

    calculateDaysUntilExpiry(endDate) {
        const now = new Date();
        const diffTime = new Date(endDate) - now;
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    shouldSendReminder(subscription, daysUntilExpiry) {
        if (![1, 2, 3].includes(daysUntilExpiry)) return false;
        if (subscription.lastReminderSentAt) {
            const hoursSince = (Date.now() - new Date(subscription.lastReminderSentAt)) / (1000 * 60 * 60);
            if (hoursSince < 20) return false;
        }
        return true;
    }

    shouldSendGracePeriodReminder(subscription) {
        if (!subscription.lastReminderSentAt) return true;
        const hoursSince = (Date.now() - new Date(subscription.lastReminderSentAt)) / (1000 * 60 * 60);
        return hoursSince >= 20;
    }
}

module.exports = new SubscriptionLifecycleService();
