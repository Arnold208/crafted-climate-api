const basicAuth = require('express-basic-auth');

// Get credentials from environment variables (fallback to default if not set)
const username = process.env.ADMIN_SWAGGER_USERNAME || 'Backoffice_Admin';
const password = process.env.ADMIN_SWAGGER_PASSWORD || '#craftedClimateAdmin123!';

// Create users object with environment variables
const users = {};
users[username] = password;

// Basic authentication middleware
const adminAuth = basicAuth({
    users: users,
    challenge: true,
    realm: 'CraftedClimate Backoffice API Documentation'
});

module.exports = adminAuth;
