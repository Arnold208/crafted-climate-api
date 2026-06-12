const { Worker } = require('bullmq');
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

const connection = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
};

class WebhookWorker {
    constructor() {
        this.worker = null;
    }

    async start() {
        if (this.worker) {
            logger.info('[WebhookWorker] Already running');
            return;
        }

        logger.info('[WebhookWorker] Starting...');

        this.worker = new Worker('webhook-delivery', async (job) => {
            await this.processJob(job);
        }, {
            connection,
            concurrency: 10, // Process up to 10 webhooks concurrently
        });

        this.worker.on('completed', (job) => {
            logger.info(`[WebhookWorker] Webhook delivery job ${job.id} completed successfully`);
        });

        this.worker.on('failed', (job, err) => {
            logger.error(`[WebhookWorker] Webhook delivery job ${job.id || 'unknown'} failed: ${err.message}`);
        });

        logger.info('[WebhookWorker] Started successfully');
    }

    async processJob(job) {
        const { url, payload, secret, eventType, deliveryId } = job.data;

        if (!url || !payload || !secret || !eventType || !deliveryId) {
            logger.error(`[WebhookWorker] Invalid job payload structure for job ${job.id}`);
            return;
        }

        const serializedPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
        const signature = crypto
            .createHmac('sha256', secret)
            .update(serializedPayload)
            .digest('hex');

        try {
            logger.info(`[WebhookWorker] Dispatching event '${eventType}' to ${url}`);
            
            const response = await axios.post(url, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-CraftedClimate-Signature': signature,
                    'X-CraftedClimate-Event': eventType,
                    'X-CraftedClimate-Delivery-Id': deliveryId,
                    'User-Agent': 'CraftedClimate-Webhook-Dispatcher/1.0',
                },
                timeout: 5000, // 5s timeout
            });

            logger.info(`[WebhookWorker] Delivery succeeded for deliveryId: ${deliveryId}. Status: ${response.status}`);
        } catch (error) {
            const status = error.response ? error.response.status : 'NO_RESPONSE';
            const message = error.response && error.response.data ? JSON.stringify(error.response.data) : error.message;
            logger.warn(`[WebhookWorker] Delivery failed for deliveryId: ${deliveryId}. Status: ${status}. Error: ${message}`);
            // Re-throw to let BullMQ handle retry mechanism
            throw new Error(`Webhook delivery failed with status ${status}: ${message}`);
        }
    }

    async stop() {
        if (this.worker) {
            await this.worker.close();
            this.worker = null;
        }
        logger.info('[WebhookWorker] Stopped');
    }
}

module.exports = new WebhookWorker();
