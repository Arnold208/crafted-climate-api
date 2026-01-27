// bullqueue.js
const { Queue } = require('bullmq');
const dotenv = require('dotenv');
const path = require('path');

let envFile;

if (process.env.NODE_ENV === 'development') {
  envFile = '.env.development';
} else {
  envFile = '.env';   // default for production or if NODE_ENV not set
}

dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  // 🔒 PRODUCTION HARDENING: Prevent memory crashes during Redis outages
  maxRetriesPerRequest: 3,        // Fail fast if Redis is busy
  enableOfflineQueue: false,      // Do not buffer in RAM if Redis is down
};

const telemetryQueue = new Queue('telemetry', { connection });
const statusQueue = new Queue('status', { connection });
const flushQueue = new Queue('flush-telem', {
  connection,
  defaultJobOptions: {
    attempts: 1, // idempotent
    removeOnComplete: { age: 3600, count: 5000 },
    removeOnFail: { age: 86400, count: 1000 },
  },
});

// Subscription Queue for lifecycle management
const subscriptionQueue = new Queue('subscriptions', {
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

console.log('✅ Redis connection and Queues created');
module.exports = { telemetryQueue, statusQueue, flushQueue, subscriptionQueue };
