const { sendSMS } = require('./sms');

const recipient = '233578254292';
const text = 'Hello from CraftedClimate! AQI is coming soon';

sendSMS(recipient, text)
  .then(() => console.log('SMS Test Completed'))
  .catch(err => console.error('SMS Test Failed:', err));
