const { Queue } = require('bullmq');
const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'development' ? '.env.development' : '.env';
dotenv.config({ path: path.resolve(__dirname, `../../../../${envFile}`) });

const connection = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    keepAlive: 30000,
    maxRetriesPerRequest: null,
};

/**
 * Push Notification Queue
 *
 * Job types:
 *  - send_single  : single user, resolves tokens from DB, sends immediately
 *  - send_batch   : pre-resolved token chunk (max 500), calls FCM sendEach
 *  - send_topic   : FCM topic broadcast (all-users / custom topic)
 *
 * For mass sends the service pre-chunks all tokens into N batch jobs
 * so the queue distributes load across worker concurrency slots.
 */
const pushQueue = new Queue('push_notifications', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 10000,           // 10 s initial, then 20 s, 40 s
        },
        removeOnComplete: { age: 86400,  count: 2000 },   // keep 24 h
        removeOnFail:    { age: 604800,  count: 1000 },   // keep 7 d
    },
});

console.log('✅ Push Notification Queue created');

module.exports = { pushQueue };
