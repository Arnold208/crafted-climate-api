// middleware/apiKeymiddleware.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load correct .env file based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });

function verifyApiKey(req, res, next) {
  const apiKeyFromHeader = req.headers['x-api-key']; // Case-insensitive by Node.js
  const validApiKey = process.env.API_KEY;

  if (!apiKeyFromHeader) {
    return res.status(401).json({ error: 'API key missing from headers' });
  }

  if (apiKeyFromHeader !== validApiKey) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  next(); // Authorized
}

module.exports = verifyApiKey;
