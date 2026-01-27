const { Worker } = require('bullmq');
const { emailQueue } = require('../config/queue/bullMQ/emailQueue');
const emailService = require('../services/email/email.service');
const Notification = require('../models/notification/Notification');
const User = require('../models/user/userModel');
const NotificationPreference = require('../models/notification/NotificationPreference');

const connection = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
};

/**
 * Email Worker using BullMQ
 * Processes queued notification emails
 */
class EmailWorker {
    constructor() {
        this.worker = null;
        this.digestInterval = null;
    }

    /**
     * Start email worker
     */
    async start() {
        if (this.worker) {
            console.log('[EmailWorker] Already running');
            return;
        }

        console.log('[EmailWorker] Starting...');

        // Create BullMQ worker
        this.worker = new Worker('emails', async (job) => {
            await this.processJob(job);
        }, {
            connection,
            concurrency: 5, // Process 5 emails concurrently
        });

        this.worker.on('completed', (job) => {
            console.log(`[EmailWorker] Job ${job.id} completed`);
        });

        this.worker.on('failed', (job, err) => {
            console.error(`[EmailWorker] Job ${job.id} failed:`, err.message);
        });

        // Start digest processor (runs every hour)
        this.startDigestProcessor();

        console.log('[EmailWorker] Started successfully');
    }

    /**
     * Process email job
     */
    async processJob(job) {
        const { notificationId, userid } = job.data;

        try {
            // Get notification
            const notification = await Notification.findOne({ notificationId });
            if (!notification) {
                console.error(`[EmailWorker] Notification ${notificationId} not found`);
                return;
            }

            // Get user
            const user = await User.findOne({ userid }).select('email firstName lastName').lean();
            if (!user || !user.email) {
                console.error(`[EmailWorker] User ${userid} email not found`);
                return;
            }

            // Send email
            const result = await emailService.sendNotificationEmail(user, notification);

            if (result.success) {
                notification.markDelivered('email');
                await notification.save();
                console.log(`[EmailWorker] Sent email to ${user.email}`);
            }
        } catch (error) {
            console.error('[EmailWorker] Process error:', error);
            throw error; // Let BullMQ handle retry
        }
    }

    /**
     * Start digest processor
     */
    startDigestProcessor() {
        // Run every hour
        this.digestInterval = setInterval(async () => {
            const now = new Date();
            const hour = now.getHours();
            const day = now.getDay();

            // Daily digests at 9 AM
            if (hour === 9) {
                await this.processDailyDigests();
            }

            // Weekly digests on Monday at 9 AM
            if (day === 1 && hour === 9) {
                await this.processWeeklyDigests();
            }
        }, 60 * 60 * 1000); // 1 hour

        console.log('[EmailWorker] Digest processor started');
    }

    /**
     * Process daily digests
     */
    async processDailyDigests() {
        console.log('[EmailWorker] Processing daily digests...');

        const prefs = await NotificationPreference.find({
            'preferences.email.frequency': 'daily',
            'preferences.email.enabled': true
        }).lean();

        for (const pref of prefs) {
            await this.sendDigest(pref.userid, 'daily');
        }
    }

    /**
     * Process weekly digests
     */
    async processWeeklyDigests() {
        console.log('[EmailWorker] Processing weekly digests...');

        const prefs = await NotificationPreference.find({
            'preferences.email.frequency': 'weekly',
            'preferences.email.enabled': true
        }).lean();

        for (const pref of prefs) {
            await this.sendDigest(pref.userid, 'weekly');
        }
    }

    /**
     * Send digest email
     */
    async sendDigest(userid, frequency) {
        try {
            const cutoffDate = frequency === 'daily'
                ? new Date(Date.now() - 24 * 60 * 60 * 1000)
                : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

            // Get unread notifications
            const notifications = await Notification.find({
                userid,
                read: false,
                createdAt: { $gte: cutoffDate },
                channels: 'email'
            }).sort({ createdAt: -1 }).lean();

            if (notifications.length === 0) {
                console.log(`[EmailWorker] No notifications for ${userid} digest`);
                return;
            }

            // Get user
            const user = await User.findOne({ userid }).select('email firstName lastName').lean();
            if (!user || !user.email) return;

            // Send digest
            await emailService.sendDigestEmail(user, notifications, frequency);

            console.log(`[EmailWorker] Sent ${frequency} digest to ${user.email}`);
        } catch (error) {
            console.error(`[EmailWorker] Digest error for ${userid}:`, error);
        }
    }

    /**
     * Stop worker
     */
    async stop() {
        if (this.worker) {
            await this.worker.close();
            this.worker = null;
        }

        if (this.digestInterval) {
            clearInterval(this.digestInterval);
            this.digestInterval = null;
        }

        console.log('[EmailWorker] Stopped');
    }
}

module.exports = new EmailWorker();
