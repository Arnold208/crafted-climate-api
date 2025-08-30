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
};

const telemetryQueue = new Queue('telemetry', { connection });
const statusQueue = new Queue('status', { connection });
const flushQueue     = new Queue('flush-telem', {
  connection,
  defaultJobOptions: {
    attempts: 1, // idempotent
    removeOnComplete: { age: 3600, count: 5000 },
    removeOnFail:     { age: 86400, count: 1000 },
  },
});

console.log('✅ Redis connection and Queue created');
module.exports = {telemetryQueue,statusQueue, flushQueue};
