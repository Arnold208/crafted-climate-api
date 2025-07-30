const telemetryQueue = require('./bullqueue');

async function addTestJob() {
  try {
    console.log('⏳ Adding test job...');
    const result = await telemetryQueue.add('test-job', {
      deviceId: 'sensor-123',
      temperature: 29.3,
      humidity: 68,
      timestamp: new Date().toISOString()
    });
    console.log('✅ Test job added:', result.id);
  } catch (error) {
    console.error('❌ Failed to add job:', error);
  }
}

addTestJob();
