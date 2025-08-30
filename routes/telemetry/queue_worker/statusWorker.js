// workers/statusWorker.js
const { Worker } = require('bullmq');
const dotenv = require('dotenv');
const path = require('path');

// Reuse your already-connected Redis client (node-redis v4 or ioredis w/ similar API)
const { client: redisClient } = require('../../../config/redis/redis');
// Read-only registration check
const registerNewDevice = require('../../../model/devices/registerDevice');

function startStatusWorker() {
  let envFile;

if (process.env.NODE_ENV === 'development') {
  envFile = '.env.development';
} else {
  envFile = '.env';   // default for production or if NODE_ENV not set
}

dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });
  // BullMQ connection
  const connection = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  };

  // TTLs
  const PRESENCE_TTL_SECONDS = parseInt(
    process.env.DEVICE_PRESENCE_TTL_SECONDS || process.env.DEVICE_STATUS_TTL_SECONDS || '180',
    10
  );
  const LASTSEEN_TTL_SECONDS = parseInt(
    process.env.DEVICE_LASTSEEN_TTL_SECONDS || String(24 * 60 * 60),
    10
  );

  // Keys
  const kPresence = (id) => `device:presence:${id}`;
  const kLastSeen = (id) => `device:lastseen:${id}`;
  const kState   = (id) => `device:state:${id}`;
  const kAllSet  = 'devices:all';

  // node-redis v4 vs ioredis shim
  const sAdd = (...args) => (typeof redisClient.sAdd === 'function'
    ? redisClient.sAdd(...args)
    : redisClient.sadd(...args));

  const worker = new Worker(
    'status',
    async (job) => {
      // Disable retries for status pings (idempotent)
      job.discard();

      // 0) Extract devid (body-only per your rule, with a fallback if you ever change producers)
      const devid =
        job?.data?.body?.devid ??
        job?.data?.devid ??
        job?.data?.deviceId ??
        job?.data?.body?.deviceId;

      if (!devid) {
        // Ignore silently; DO NOT job.remove() here
        return;
      }

      const presenceKey = kPresence(devid);
      const lastSeenKey = kLastSeen(devid);
      const stateKey    = kState(devid);
      const nowIso = new Date().toISOString();

      // 1) If already in cache → refresh TTLs atomically
      const inCache = await redisClient.exists(presenceKey);
      if (inCache) {
        const tx = redisClient.multi();
        tx.set(presenceKey, '1', 'EX', PRESENCE_TTL_SECONDS);
        tx.set(lastSeenKey, nowIso, 'EX', LASTSEEN_TTL_SECONDS);
        tx.set(stateKey, 'online', 'EX', LASTSEEN_TTL_SECONDS);
        // add to devices:all (compat for redis/ioredis)
        if (typeof tx.sAdd === 'function') tx.sAdd(kAllSet, devid);
        else if (typeof tx.sadd === 'function') tx.sadd(kAllSet, devid);
        await tx.exec();
        return;
      }

      // 2) Not in cache → ensure device is registered
      const isRegistered = await registerNewDevice.exists({ devid });
      if (!isRegistered) {
        // Ignore unregistered pings; DO NOT job.remove()
        return;
      }

      // 3) Registered → write presence + lastSeen + state
      const tx = redisClient.multi();
      tx.set(presenceKey, '1', 'EX', PRESENCE_TTL_SECONDS);
      tx.set(lastSeenKey, nowIso, 'EX', LASTSEEN_TTL_SECONDS);
      tx.set(stateKey, 'online', 'EX', LASTSEEN_TTL_SECONDS);
      if (typeof tx.sAdd === 'function') tx.sAdd(kAllSet, devid);
      else if (typeof tx.sadd === 'function') tx.sadd(kAllSet, devid);
      await tx.exec();

      return;
    },
    {
      connection,
      removeOnComplete: { age: 60, count: 1000 },
      removeOnFail: { age: 3600, count: 100 },
      // Optional tuning to reduce lock churn:
      // concurrency: 10,
      // lockDuration: 30000,
    }
  );

  worker.on('completed', (job) => console.log(`✅ Status Job ${job.id} completed`));
  worker.on('failed', (job, err) => console.error(`❌ Status Job ${job?.id} failed:`, err?.stack || err));
  worker.on('error', (err) => console.error('🚨 Status Worker error:', err));

  return worker;
}

module.exports = { startStatusWorker };
