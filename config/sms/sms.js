const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

let envFile;

if (process.env.NODE_ENV === 'development') {
  envFile = '.env.development';
} else {
  envFile = '.env';   // default for production or if NODE_ENV not set
}

dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });

async function sendSMS(msisdn, message) {
    const payload = {
        key: process.env.NALO_AUTH_KEY,
        msisdn,
        message,
        sender_id: process.env.NALO_SENDER_ID
    };

    try {
        const response = await axios.post(
            process.env.NALO_SMS_URL,
            payload,
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

         return response.data;
    } catch (error) {
        console.error('❌ Error sending SMS:', error.response?.data || error.message);
        throw error;
    }
}

module.exports = { sendSMS };
