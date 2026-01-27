const { Queue, Worker } = require('bullmq');
const path = require('path');
const dotenv = require('dotenv');

let envFile;
if (process.env.NODE_ENV === 'development') {
    envFile = '.env.development';
} else {
    envFile = '.env';
}

dotenv.config({ path: path.resolve(__dirname, `../../../${envFile}`) });

const connection = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
};

// Email Queue for notification emails
const emailQueue = new Queue('emails', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000, // 5 seconds
        },
        removeOnComplete: { age: 86400, count: 1000 }, // Keep for 24 hours
        removeOnFail: { age: 604800, count: 500 }, // Keep failures for 7 days
    },
});

console.log('✅ Email Queue created');

module.exports = { emailQueue };
