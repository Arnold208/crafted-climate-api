// middlewares/rateLimiter.js
const rateLimit = require('express-rate-limit');

// 🔐 Global Rate Limiter – applies to all routes
const globalRateLimiter = rateLimit({
  windowMs: parseInt(process.env.GLOBAL_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 100 requests per 15 minutes
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// 📘 Swagger Rate Limiter – more strict
const swaggerRateLimiter = rateLimit({
  windowMs: parseInt(process.env.SWAGGER_LIMIT_WINDOW_MS) || 1 * 60 * 1000, // 1 minute
  max: 10, // Limit to 10 Swagger hits per minute
  message: 'Too many requests to Swagger docs. Try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: parseInt(process.env.OTP_LIMIT_WINDOW_MS) || 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many OTP requests. Please try again later.'
});
module.exports = {
  globalRateLimiter,
  swaggerRateLimiter,
  otpLimiter
};
