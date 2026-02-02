const axios = require('axios');
const FormData = require('form-data');

const BASE_URL = 'http://localhost:3000/api';

async function testProfile() {
    try {
        console.log('--- Testing /api/user/profile directly with dummy token ---');
        try {
            await axios.get(`${BASE_URL}/user/profile`, {
                headers: { Authorization: `Bearer dummy_token` }
            });
        } catch (error) {
            console.log('Direct Profile Check Status:', error.response ? error.response.status : error.message);
            // Expect 403 or 401 if route exists. 404 if not.
            if (error.response && error.response.status === 404) {
                console.error('CRITICAL: Endpoint /api/user/profile NOT FOUND');
            } else {
                console.log('Endpoint exists (received non-404 error)');
            }
        }

        console.log('\n--- Attempting Full Flow ---');
        const form = new FormData();
        const suffix = Date.now();
        const username = `testuser${suffix}`;
        const email = `test${suffix}@example.com`;
        const password = 'Password123!';

        form.append('username', username);
        form.append('email', email);
        form.append('password', password);
        form.append('firstName', 'Test');
        form.append('lastName', 'User');

        console.log('1. Signing up...', email);
        let signupRes;
        try {
            signupRes = await axios.post(`${BASE_URL}/auth/signup`, form, {
                headers: form.getHeaders()
            });
            console.log('Signup Status:', signupRes.status);
        } catch (e) {
            console.error('Signup failed:', e.response ? e.response.data : e.message);
            // If signup fails, we can't proceed easily unless we know a valid user
            return;
        }

        console.log('2. Logging in...');
        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            email: email,
            password: password
        });

        const { accessToken } = loginRes.data;
        if (!accessToken) {
            console.error('No access token received');
            return;
        }
        console.log('Token received:', accessToken.substring(0, 20) + '...');

        console.log('3. Fetching User Profile (/api/user/profile)...');
        const profileRes = await axios.get(`${BASE_URL}/user/profile`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        console.log('Profile Response Status:', profileRes.status);
        console.log('Profile Data received:', !!profileRes.data);

    } catch (error) {
        console.error('Test Failed:', error.response ? {
            status: error.response.status,
            data: error.response.data,
            url: error.response.config.url
        } : error.message);
    }
}

testProfile();
