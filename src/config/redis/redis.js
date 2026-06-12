const { createClient, createCluster } = require('redis');
const dotenv = require('dotenv');
const path = require('path');

let envFile;

if (process.env.NODE_ENV === 'development') {
  envFile = '.env.development';
} else {
  envFile = '.env';   // default for production or if NODE_ENV not set
}

dotenv.config({ path: path.resolve(__dirname, `../../../${envFile}`) });

const useCluster = process.env.REDIS_USE_CLUSTER === 'true';
let client;

if (useCluster) {
  const nodes = (process.env.REDIS_CLUSTER_NODES || '127.0.0.1:6379')
    .split(',')
    .map(node => {
      const [host, port] = node.trim().split(':');
      return {
        url: `redis://${host}:${port || '6379'}`
      };
    });

  client = createCluster({
    rootNodes: nodes,
    defaults: {
      password: process.env.REDIS_PASSWORD || undefined,
      socket: {
        keepAlive: 30000
      }
    }
  });
} else {
  client = createClient({
    socket: {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      keepAlive: 30000,
      reconnectStrategy: (retries) => {
        const delay = Math.min(1000 * Math.max(retries, 1), 3000); // Max 3 seconds, min 1 second
        console.warn(`🔁 Redis reconnect attempt ${retries} — retrying in ${delay}ms`);
        return delay;
      }
    },
    password: process.env.REDIS_PASSWORD || undefined
  });
}

// Required error handler to prevent process crash
client.on('error', (err) => {
  console.error('❌ Redis Client Error:', err.message);
});

// Optional event logging
client.on('connect', () => {
  console.log('✅ Redis connected');
});
client.on('reconnecting', () => {
  console.log('🔄 Redis reconnecting...');
});
client.on('end', () => {
  console.warn('⚠️ Redis connection closed');
});

const connectRedis = async () => {
  if (!client.isOpen) {
    try {
      await client.connect();
    } catch (err) {
      console.error('❌ Redis initial connect failed:', err.message);
    }
  }
};

module.exports = { client, connectRedis };
