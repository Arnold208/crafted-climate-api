const { createClient } = require('redis');
const dotenv = require('dotenv');
const path = require('path');

let envFile;

if (process.env.NODE_ENV === 'development') {
  envFile = '.env.development';
} else {
  envFile = '.env';   // default for production or if NODE_ENV not set
}

dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });

const client = createClient({
  socket: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    reconnectStrategy: (retries) => {
      const delay = Math.min(1000 * retries, 3000); // Max 3 seconds
      console.warn(`🔁 Redis reconnect attempt ${retries} — retrying in ${delay}ms`);
      return delay;
    }
  },
  password: process.env.REDIS_PASSWORD || undefined
});

// Optional: Detailed event logging
client.on('connect', () => {
  console.log('✅ Redis connected');
});
client.on('reconnecting', () => {
  console.log('🔄 Redis reconnecting...');
});
client.on('error', (err) => {
  console.error('❌ Redis Client Error:', err.message);
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
