const { Worker } = require('bullmq');
const dotenv = require('dotenv');
const path = require('path');

// Load .env file
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: path.resolve(__dirname, `../../../${envFile}`) });

// Redis connection object
const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

// Create the worker
const worker = new Worker(
  'telemetry',
  async job => {
    console.log('👷 Processing job:', job.name);
    console.log('📦 Data:', job.data);
  },
  { connection }
);

worker.on('completed', job => {
  console.log(`✅ Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
});
