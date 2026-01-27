const basicAuth = require('express-basic-auth');

// Get credentials from environment variables
const username = process.env.SWAGGER_USERNAME;
const password = process.env.SWAGGER_PASSWORD;

// Create users object with environment variables
const users = {};
users[username] = password;

// Basic authentication middleware
const auth = basicAuth({
    users: users,
    challenge: true,
    realm: 'CraftedClimate API Documentation'
});

module.exports = auth;
