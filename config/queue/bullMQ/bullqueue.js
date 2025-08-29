// bullqueue.js
const { Queue } = require('bullmq');
const dotenv = require('dotenv');
const path = require('path');

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: path.resolve(__dirname, `../../../${envFile}`) });

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

const telemetryQueue = new Queue('telemetry', { connection });
const statusQueue = new Queue('status', { connection });


console.log('✅ Redis connection and Queue created');
module.exports = {telemetryQueue,statusQueue};
