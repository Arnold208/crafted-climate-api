/**
 * Subscription Lifecycle Management Service
 * Handles subscription expiry, grace periods, and freemium downgrades
 * 
 * Timeline:
 * - Day -3 to -1: Pre-expiry reminders
 * - Day 0: Subscription expires, enter grace period
 * - Day +1 to +3: Grace period reminders
 * - Day +3: Downgrade to freemium
 */

const UserSubscription = require('../../models/subscriptions/UserSubscription');
const SubscriptionPlan = require('../../models/subscriptions/Plan');
const User = require('../../models/user/userModel');
const { sendEmail } = require('../../config/mail/nodemailer');
const { subscriptionQueue } = require('../../config/queue/bullMQ/bullqueue');

class SubscriptionLifecycleService {

    /**
     * 📅 CHECK EXPIRING SUBSCRIPTIONS
     * Find subscriptions expiring in the next 3 days
     * Called daily by cron job
     */
    async checkExpiringSubscriptions() {
        const now = new Date();
        const threeDaysFromNow = new Date(now);
        threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

        // Find active subscriptions expiring in next 3 days
        const expiringSubscriptions = await UserSubscription.find({
            status: 'active',
            endDate: { $lte: threeDaysFromNow, $gte: now },
            billingCycle: { $ne: 'free' } // Don't remind free users
        });

        console.log(`📅 Found ${expiringSubscriptions.length} expiring subscriptions`);

        for (const subscription of expiringSubscriptions) {
            const daysUntilExpiry = this.calculateDaysUntilExpiry(subscription.endDate);

            // Only send reminder if we haven't sent one today
            if (this.shouldSendReminder(subscription, daysUntilExpiry)) {
                await subscriptionQueue.add('send-expiry-reminder', {
                    subscriptionId: subscription.subscriptionId,
                    daysUntilExpiry
                });
            }
        }

        return { checked: expiringSubscriptions.length };
    }

    /**
     * 📧 SEND EXPIRY REMINDER
     * Send email reminder about upcoming expiry
     */
    async sendExpiryReminder(subscriptionId, daysUntilExpiry) {
        const subscription = await UserSubscription.findOne({ subscriptionId });
        if (!subscription) return;

        const user = await User.findOne({ userid: subscription.userid });
        if (!user || !user.email) return;

        const plan = await Plan.findOne({ planId: subscription.planId });
        const planName = plan ? plan.name : 'Your Plan';

        let subject, body;

        if (daysUntilExpiry === 3) {
            subject = `Your ${planName} subscription expires in 3 days`;
            body = `
                <h2>Subscription Expiring Soon</h2>
                <p>Hi ${user.username || 'there'},</p>
                <p>Your <strong>${planName}</strong> subscription will expire in <strong>3 days</strong>.</p>
                <p><strong>Expiry Date:</strong> ${subscription.endDate.toLocaleDateString()}</p>
                <p>To continue enjoying premium features, please renew your subscription before it expires.</p>
                <br>
                <p><a href="${process.env.FRONTEND_URL}/subscriptions" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Renew Now</a></p>
            `;
        } else if (daysUntilExpiry === 2) {
            subject = `Your ${planName} subscription expires in 2 days`;
            body = `
                <h2>Subscription Expiring Soon</h2>
                <p>Hi ${user.username || 'there'},</p>
                <p>Your <strong>${planName}</strong> subscription will expire in <strong>2 days</strong>.</p>
                <p><strong>Expiry Date:</strong> ${subscription.endDate.toLocaleDateString()}</p>
                <p>Don't lose access to your premium features! Renew today.</p>
                <br>
                <p><a href="${process.env.FRONTEND_URL}/subscriptions" style="background-color: #FF9800; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Renew Now</a></p>
            `;
        } else if (daysUntilExpiry === 1) {
            subject = `Your ${planName} subscription expires tomorrow!`;
            body = `
                <h2>Last Chance!</h2>
                <p>Hi ${user.username || 'there'},</p>
                <p>Your <strong>${planName}</strong> subscription expires <strong>tomorrow</strong>!</p>
                <p><strong>Expiry Date:</strong> ${subscription.endDate.toLocaleDateString()}</p>
                <p>This is your last day to renew before entering the grace period.</p>
                <br>
                <p><a href="${process.env.FRONTEND_URL}/subscriptions" style="background-color: #F44336; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Renew Now</a></p>
            `;
        }

        await sendEmail(user.email, subject, body);

        // Update reminder tracking
        subscription.lastReminderSentAt = new Date();
        subscription.reminderCount += 1;
        await subscription.save();

        console.log(`Sent expiry reminder to ${user.email} (${daysUntilExpiry} days)`);
    }

    /**
     * 🔄 CHECK GRACE PERIOD SUBSCRIPTIONS
     * Find subscriptions in grace period and send reminders
     * Called daily by cron job
     */
    async checkGracePeriodSubscriptions() {
        const now = new Date();

        // Find subscriptions in grace period
        const gracePeriodSubscriptions = await UserSubscription.find({
            status: 'grace_period',
            gracePeriodEndDate: { $gte: now }
        });

        console.log(`🔄 Found ${gracePeriodSubscriptions.length} subscriptions in grace period`);

        for (const subscription of gracePeriodSubscriptions) {
            const daysRemaining = this.calculateDaysUntilExpiry(subscription.gracePeriodEndDate);

            // Send daily reminder
            if (this.shouldSendGracePeriodReminder(subscription)) {
                await subscriptionQueue.add('send-grace-period-reminder', {
                    subscriptionId: subscription.subscriptionId,
                    daysRemaining
                });
            }

            // Check if grace period has ended
            if (daysRemaining <= 0) {
                await subscriptionQueue.add('end-grace-period', {
                    subscriptionId: subscription.subscriptionId
                });
            }
        }

        return { checked: gracePeriodSubscriptions.length };
    }

    /**
     * 🚀 START GRACE PERIOD
     * Transition expired subscription to grace period
     */
    async startGracePeriod(subscriptionId) {
        const subscription = await UserSubscription.findOne({ subscriptionId });
        if (!subscription) return;

        const gracePeriodStart = new Date();
        const gracePeriodEnd = new Date(gracePeriodStart);
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 3); // 3-day grace period

        subscription.status = 'grace_period';
        subscription.gracePeriodStartDate = gracePeriodStart;
        subscription.gracePeriodEndDate = gracePeriodEnd;
        subscription.previousPlanId = subscription.planId; // Save for potential restoration
        subscription.reminderCount = 0; // Reset counter
        await subscription.save();

        // Send grace period start email
        const user = await User.findOne({ userid: subscription.userid });
        if (user && user.email) {
            const plan = await Plan.findOne({ planId: subscription.planId });
            const planName = plan ? plan.name : 'Your Plan';

            const subject = `Your ${planName} subscription has expired - Grace Period Started`;
            const body = `
                <h2>Subscription Expired</h2>
                <p>Hi ${user.username || 'there'},</p>
                <p>Your <strong>${planName}</strong> subscription has expired.</p>
                <p>We've activated a <strong>3-day grace period</strong> for you to renew without losing access.</p>
                <p><strong>Grace Period Ends:</strong> ${gracePeriodEnd.toLocaleDateString()}</p>
                <p>After the grace period, your account will be downgraded to the freemium plan.</p>
                <br>
                <p><a href="${process.env.FRONTEND_URL}/subscriptions" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Renew Now</a></p>
            `;

            await sendEmail(user.email, subject, body);
        }

        console.log(`Started grace period for subscription ${subscriptionId}`);
    }

    /**
     * 📧 SEND GRACE PERIOD REMINDER
     */
    async sendGracePeriodReminder(subscriptionId, daysRemaining) {
        const subscription = await UserSubscription.findOne({ subscriptionId });
        if (!subscription) return;

        const user = await User.findOne({ userid: subscription.userid });
        if (!user || !user.email) return;

        const plan = await Plan.findOne({ planId: subscription.previousPlanId || subscription.planId });
        const planName = plan ? plan.name : 'Your Plan';

        let subject, body;

        if (daysRemaining === 2) {
            subject = `Grace Period: 2 days remaining to renew ${planName}`;
            body = `
                <h2>Grace Period Active</h2>
                <p>Hi ${user.username || 'there'},</p>
                <p>You have <strong>2 days remaining</strong> in your grace period.</p>
                <p>Renew your <strong>${planName}</strong> subscription to avoid being downgraded to freemium.</p>
                <br>
                <p><a href="${process.env.FRONTEND_URL}/subscriptions" style="background-color: #FF9800; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Renew Now</a></p>
            `;
        } else if (daysRemaining === 1) {
            subject = `Final Day: Grace period ends tomorrow`;
            body = `
                <h2>Last Chance!</h2>
                <p>Hi ${user.username || 'there'},</p>
                <p>This is your <strong>final day</strong> to renew your subscription.</p>
                <p>Tomorrow, your account will be downgraded to the freemium plan.</p>
                <br>
                <p><a href="${process.env.FRONTEND_URL}/subscriptions" style="background-color: #F44336; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Renew Now</a></p>
            `;
        }

        await sendEmail(user.email, subject, body);

        subscription.lastReminderSentAt = new Date();
        subscription.reminderCount += 1;
        await subscription.save();

        console.log(`Sent grace period reminder to ${user.email} (${daysRemaining} days)`);
    }

    /**
     * ⬇️ END GRACE PERIOD - DOWNGRADE TO FREEMIUM
     */
    async endGracePeriod(subscriptionId) {
        const subscription = await UserSubscription.findOne({ subscriptionId });
        if (!subscription) return;

        // Get freemium plan
        const freemiumPlan = await Plan.findOne({
            name: { $regex: /free/i }
        }).sort({ createdAt: 1 });

        if (!freemiumPlan) {
            console.error('❌ Freemium plan not found!');
            return;
        }

        const oldPlanId = subscription.planId;

        // Downgrade to freemium
        subscription.status = 'expired';
        subscription.planId = freemiumPlan.planId;
        subscription.billingCycle = 'free';
        subscription.autoRenew = false;
        await subscription.save();

        // Send downgrade notification
        const user = await User.findOne({ userid: subscription.userid });
        if (user && user.email) {
            const oldPlan = await Plan.findOne({ planId: oldPlanId });
            const oldPlanName = oldPlan ? oldPlan.name : 'Premium Plan';

            const subject = `Account Downgraded to Freemium Plan`;
            const body = `
                <h2>Account Downgraded</h2>
                <p>Hi ${user.username || 'there'},</p>
                <p>Your grace period has ended and your account has been downgraded to the <strong>Freemium Plan</strong>.</p>
                <p>You previously had: <strong>${oldPlanName}</strong></p>
                <p>You can still use Crafted Climate with limited features. Upgrade anytime to restore full access!</p>
                <br>
                <p><a href="${process.env.FRONTEND_URL}/subscriptions" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Upgrade Now</a></p>
            `;

            await sendEmail(user.email, subject, body);
        }

        console.log(`Downgraded subscription ${subscriptionId} to freemium`);
    }

    /**
     * 🔄 CANCEL GRACE PERIOD (Payment Received)
     * Called when user renews during grace period
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

    // ========================================
    // HELPER METHODS
    // ========================================

    calculateDaysUntilExpiry(endDate) {
        const now = new Date();
        const diffTime = new Date(endDate) - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    }

    shouldSendReminder(subscription, daysUntilExpiry) {
        // Only send reminder for 1, 2, or 3 days before expiry
        if (![1, 2, 3].includes(daysUntilExpiry)) return false;

        // Don't send if we already sent one today
        if (subscription.lastReminderSentAt) {
            const lastSent = new Date(subscription.lastReminderSentAt);
            const now = new Date();
            const hoursSinceLastReminder = (now - lastSent) / (1000 * 60 * 60);
            if (hoursSinceLastReminder < 20) return false; // Wait at least 20 hours
        }

        return true;
    }

    shouldSendGracePeriodReminder(subscription) {
        // Send daily reminder during grace period
        if (!subscription.lastReminderSentAt) return true;

        const lastSent = new Date(subscription.lastReminderSentAt);
        const now = new Date();
        const hoursSinceLastReminder = (now - lastSent) / (1000 * 60 * 60);

        return hoursSinceLastReminder >= 20; // Send once per day (20+ hours)
    }
}

module.exports = new SubscriptionLifecycleService();
