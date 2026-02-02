const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function testProfile() {
    try {
        // 1. Login to get token (using a known test account or create one)
        // Trying with a hypothetical user first, or I can try Signup first.
        const suffix = Date.now();
        const user = {
            username: `testuser${suffix}`,
            email: `test${suffix}@example.com`,
            password: 'Password123!',
            firstName: 'Test',
            lastName: 'User'
        };

        console.log('1. Signing up...', user.email);
        try {
            await axios.post(`${BASE_URL}/auth/signup`, user); // Note: Signup might expect multipart/form-data due to file upload middleware
            // Actually, if I send JSON to a multer endpoint without file, it usually works but req.file is undefined.
            // But let's handle it if it fails.
        } catch (e) {
            // If this fails, maybe just Login if user exists? 
            // But for unique email, we should be fine.
            if (e.response && e.response.status !== 400) {
                console.error('Signup failed:', e.response ? e.response.data : e.message);
                return;
            }
        }

        console.log('2. Logging in...');
        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            email: user.email,
            password: user.password
        });

        const { accessToken } = loginRes.data;
        if (!accessToken) {
            console.error('No access token received');
            return;
        }
        console.log('Token received.');

        console.log('3. Fetching User Profile...');
        const profileRes = await axios.get(`${BASE_URL}/user/profile`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        console.log('Profile Response:', profileRes.status, profileRes.data);

    } catch (error) {
        console.error('Test Failed:', error.response ? {
            status: error.response.status,
            data: error.response.data
        } : error.message);
    }
}

testProfile();
