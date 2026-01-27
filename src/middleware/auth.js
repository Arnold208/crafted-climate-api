/**
 * Auth Middleware Alias
 * Provides a cleaner import path for authentication middleware
 * 
 * This is an alias for bearermiddleware.js to maintain consistency
 * across the codebase while using a more intuitive name.
 */

const authenticateToken = require('./bearermiddleware');

module.exports = authenticateToken;
