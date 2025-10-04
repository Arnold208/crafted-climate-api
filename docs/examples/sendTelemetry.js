const axios = require('axios');

// Configuration
const config = {
  // For testing with mock server
  baseUrl: 'http://localhost:4010',
  // For production
  // baseUrl: 'https://api.craftedclimate.com',
  
  // MOCK CREDENTIALS - Replace with your actual credentials
  apiKey: 'cc_test_123456789',
  accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0MTIzIn0.mock',
  userId: 'test123'
};

// 1. Register a new user
async function registerUser() {
  const formData = new FormData();
  formData.append('username', 'testuser');
  formData.append('email', 'test@example.com');
  formData.append('password', 'securepass123');
  formData.append('contact', '233555123456');

  try {
    const response = await axios.post(`${config.baseUrl}/api/auth/signup`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    console.log('Registration successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Registration failed:', error.response?.data || error.message);
    throw error;
  }
}

// 2. Submit telemetry data
async function sendTelemetry(deviceId = 'device123') {
  const telemetryData = {
    i: deviceId,
    t: 25.4, // temperature
    h: 65,   // humidity
    p: 1013.25 // pressure
  };

  try {
    const response = await axios.post(
      `${config.baseUrl}/api/telemetry/env`,
      telemetryData,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': config.apiKey
        }
      }
    );
    console.log('Telemetry sent successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Failed to send telemetry:', error.response?.data || error.message);
    throw error;
  }
}

// 3. Create a deployment
async function createDeployment() {
  const deploymentData = {
    userid: config.userId,
    name: 'Test Deployment',
    description: 'Test deployment created via Node.js example'
  };

  try {
    const response = await axios.post(
      `${config.baseUrl}/api/devices/create-deployments`,
      deploymentData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.accessToken}`
        }
      }
    );
    console.log('Deployment created successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Failed to create deployment:', error.response?.data || error.message);
    throw error;
  }
}

// Run the examples
async function runExamples() {
  console.log('Running CraftedClimate API Examples...\n');

  try {
    console.log('1. Registering user...');
    await registerUser();

    console.log('\n2. Sending telemetry...');
    await sendTelemetry();

    console.log('\n3. Creating deployment...');
    await createDeployment();

    console.log('\nAll examples completed successfully!');
  } catch (error) {
    console.error('\nExample run failed:', error.message);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  runExamples();
}

module.exports = {
  registerUser,
  sendTelemetry,
  createDeployment
};