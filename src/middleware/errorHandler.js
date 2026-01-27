/**
 * Global Error Handling Middleware
 * Standardizes error responses across the entire API
 * 
 * 🔒 SECURITY: Prevents stack trace leakage in production
 */

const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
    const statusCode = err.statusCode || 500;
    const isProd = process.env.NODE_ENV === 'production';

    // Log the error for internal tracking
    logger.error(`[GlobalError] ${req.method} ${req.originalUrl}: %s`, err.message);
    if (!isProd) {
        console.error(err.stack);
    }

    // Standardized response format
    const response = {
        success: false,
        message: err.message || 'Internal Server Error',
        errorCode: err.code || 'INTERNAL_ERROR',
    };

    // Add stack trace only in development
    if (!isProd) {
        response.stack = err.stack;
    }

    // Handle Mongoose validation errors
    if (err.name === 'ValidationError') {
        response.message = 'Validation Error';
        response.errorCode = 'VALIDATION_ERROR';
        response.details = Object.values(err.errors).map(e => e.message);
        return res.status(400).json(response);
    }

    // Handle JWT authentication errors
    if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
        response.message = 'Invalid or expired authentication token';
        response.errorCode = 'AUTH_ERROR';
        return res.status(401).json(response);
    }

    res.status(statusCode).json(response);
}

module.exports = errorHandler;
