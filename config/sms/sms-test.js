const { sendSMS } = require('./sms');

const recipient = '233578254292';
const text = 'Hello from CraftedClimate! AQI is coming soon';

sendSMS(recipient, text)
  .then(() => console.log('SMS Test Completed'))
  .catch(err => console.error('SMS Test Failed:', err));
// 2dn3hQFQUDQ5VjA3TP2AZh4GYOyCSgZQMgF21Z9ARfySOyZh7BjVR1Bejfvzj_TwKH1X1_TW7eET.0oRDoQEmoQRBIfZYQIHjwi3iQPJZsUQal8LBlFfg1cboLS-Gwau6HUKuq5aN4XP2sJH6ePBJQa5sgLNhO9xLK3sDkNB-MWzvOWEpJKw