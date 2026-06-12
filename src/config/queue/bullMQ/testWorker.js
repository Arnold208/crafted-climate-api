const { Worker } = require('bullmq');
const dotenv = require('dotenv');
const path = require('path');

let envFile;

if (process.env.NODE_ENV === 'development') {
  envFile = '.env.development';
} else {
  envFile = '.env';   // default for production or if NODE_ENV not set
}

dotenv.config({ path: path.resolve(__dirname, `../../../../${envFile}`) });

// Redis connection object
const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  keepAlive: 30000,
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
