const Redis = require('ioredis');

/**
 * Redis Email Queue Service
 * Pub/Sub for scalable email delivery
 */
class EmailQueueService {
    constructor() {
        this.publisher = null;
        this.subscriber = null;
        this.isConnected = false;
    }

    /**
     * Initialize Redis connections
     */
    async initialize() {
        if (this.isConnected) return;

        try {
            const redisConfig = {
                host: process.env.REDIS_HOST || 'localhost',
                port: process.env.REDIS_PORT || 6379,
                password: process.env.REDIS_PASSWORD || undefined,
                retryStrategy: (times) => {
                    const delay = Math.min(times * 50, 2000);
                    return delay;
                }
            };

            this.publisher = new Redis(redisConfig);
            this.subscriber = new Redis(redisConfig);

            this.publisher.on('connect', () => {
                console.log('[Redis] Publisher connected');
            });

            this.subscriber.on('connect', () => {
                console.log('[Redis] Subscriber connected');
            });

            this.publisher.on('error', (err) => {
                console.error('[Redis] Publisher error:', err);
            });

            this.subscriber.on('error', (err) => {
                console.error('[Redis] Subscriber error:', err);
            });

            this.isConnected = true;
        } catch (error) {
            console.error('[Redis] Initialization error:', error);
            this.isConnected = false;
        }
    }

    /**
     * Queue email for delivery
     */
    async queueEmail(emailData) {
        if (!this.isConnected) {
            await this.initialize();
        }

        try {
            const channel = `email:${emailData.priority || 'normal'}`;
            await this.publisher.publish(channel, JSON.stringify(emailData));
            console.log(`[EmailQueue] Queued email to ${emailData.to}`);
            return true;
        } catch (error) {
            console.error('[EmailQueue] Queue error:', error);
            return false;
        }
    }

    /**
     * Queue batch emails
     */
    async queueBatch(emails) {
        if (!this.isConnected) {
            await this.initialize();
        }

        try {
            const pipeline = this.publisher.pipeline();

            for (const email of emails) {
                const channel = `email:${email.priority || 'normal'}`;
                pipeline.publish(channel, JSON.stringify(email));
            }

            await pipeline.exec();
            console.log(`[EmailQueue] Queued ${emails.length} emails`);
            return true;
        } catch (error) {
            console.error('[EmailQueue] Batch queue error:', error);
            return false;
        }
    }

    /**
     * Subscribe to email queue
     */
    async subscribe(callback) {
        if (!this.isConnected) {
            await this.initialize();
        }

        try {
            // Subscribe to all priority channels
            await this.subscriber.subscribe('email:high', 'email:normal', 'email:low');

            this.subscriber.on('message', async (channel, message) => {
                try {
                    const emailData = JSON.parse(message);
                    console.log(`[EmailQueue] Processing email from ${channel}`);
                    await callback(emailData);
                } catch (error) {
                    console.error('[EmailQueue] Message processing error:', error);
                }
            });

            console.log('[EmailQueue] Subscribed to email channels');
        } catch (error) {
            console.error('[EmailQueue] Subscribe error:', error);
        }
    }

    /**
     * Get queue stats
     */
    async getStats() {
        if (!this.isConnected) {
            await this.initialize();
        }

        try {
            const info = await this.publisher.info('stats');
            return {
                connected: this.isConnected,
                info
            };
        } catch (error) {
            console.error('[EmailQueue] Stats error:', error);
            return { connected: false };
        }
    }

    /**
     * Close connections
     */
    async close() {
        if (this.publisher) await this.publisher.quit();
        if (this.subscriber) await this.subscriber.quit();
        this.isConnected = false;
    }
}

module.exports = new EmailQueueService();
