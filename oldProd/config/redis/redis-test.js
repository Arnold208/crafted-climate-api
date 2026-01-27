const { client, connectRedis } = require('./redis.js');

(async () => {
  await connectRedis();

  const cacheKey = 'sensor:env:station01';
  const cacheData = {
    temperature: '28.4',
    humidity: '72',
    location: 'Accra'
  };

  await client.hSet(cacheKey, cacheData);
  const result = await client.hGetAll(cacheKey);

  console.log('Cached Data:', result);
})();
