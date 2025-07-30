const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

// Load correct .env file based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

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
