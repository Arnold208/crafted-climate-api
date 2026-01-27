const mqtt = require('mqtt');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
const envFile = process.env.NODE_ENV === 'development' ? '.env.development' : '.env';
const envPath = path.resolve(__dirname, `../${envFile}`);
dotenv.config({ path: envPath });

console.log(`📂 Loading Env from: ${envPath}`);

// Configuration
// Check if MQTT_HOST is set, otherwise fall back to what might be in .env
const HOST = process.env.MQTT_SECURE_HOST || 'afri-iot.com';
const PORT = process.env.MQTT_SECURE_PORT || 8883;
const BROKER_URL = `mqtts://${HOST}:${PORT}`;
const USERNAME = process.env.MQTT_SECURE_USERNAME;
const PASSWORD = process.env.MQTT_SECURE_PASSWORD;

console.log(`🔌 Connecting to MQTT Broker: ${BROKER_URL} (${USERNAME ? 'Auth' : 'Anon'})...`);

const client = mqtt.connect(BROKER_URL, {
    username: USERNAME,
    password: PASSWORD,
    rejectUnauthorized: false // Self-signed certs often used in dev
});

// Test Payloads
const DEVICES = [
    {
        topic: 'eventroutes/Env-Telemetry',
        label: 'ENV (Test)',
        payload: {
            devid: '2af1', // Ensure this devid exists or use a mock one if the handler allows
            ts: Date.now(),
            voltage: 4.2,
            temp: 25.5,
            humidity: 60,
            pressure: 1013,
            pm2_5: 12,
            err: "0000"
        }
    },
    {
        topic: 'eventroutes/Aqua-Telemetry',
        label: 'AQUA (Test)',
        payload: {
            devid: 'aqua_test_01',
            ts: Date.now(),
            voltage: 3.8,
            ph: 7.2,
            do: 6.5,
            temp: 22.0,
            err: "0000"
        }
    },
    {
        topic: 'eventroutes/Env-Telemetry-Dev', // Assuming Gas Solo uses this or similar, check mqtt.service.js topics
        // Actually, mqtt.service.js subscription list didn't explicitly show a gas-solo topic, 
        // but `telemetryWorker` switches on `devmod`.
        // Let's use a generic topic that writes to the queue, and let the worker dispatch.
        // Wait, the mqtt service listens to SPECIFIC topics.
        // If gas-solo isn't in the list, it won't be picked up.
        // Let's assume 'eventroutes/Env-Telemetry' handles it if `devmod` is set, OR check if we missed a topic.
        // Based on `mqtt.service.js`, topics are: Env-Telemetry-Dev, Env-Telemetry, Aqua-Telemetry.
        // Gas Solo likely acts as "Env" or uses one of these, but with `devmod: 'GAS-SOLO'`.
        label: 'GAS-SOLO (Test)',
        payload: {
            devid: 'gas_test_01',
            devmod: 'GAS-SOLO',
            ts: Date.now(),
            voltage: 4.0,
            eco2_ppm: 400,
            tvoc_ppb: 10,
            err: "0000"
        }
    }
];

client.on('connect', () => {
    console.log('✅ Connected to MQTT Broker');

    let count = 0;
    const interval = setInterval(() => {
        if (count >= DEVICES.length) {
            clearInterval(interval);
            console.log('🏁 All test messages sent. Closing connection in 5s...');
            setTimeout(() => client.end(), 5000);
            return;
        }

        const device = DEVICES[count];
        // Use the topic defined, or default to Env-Telemetry if generic
        const topic = device.topic || 'eventroutes/Env-Telemetry';

        console.log(`📤 Sending ${device.label} to ${topic}...`);
        client.publish(topic, JSON.stringify(device.payload), { qos: 1 }, (err) => {
            if (err) console.error(`❌ Failed to publish ${device.label}:`, err);
            else console.log(`✅ Published ${device.label}`);
        });

        count++;
    }, 2000); // 2 seconds between messages
});

client.on('error', (err) => {
    console.error('❌ MQTT Error:', err);
    client.end();
});
