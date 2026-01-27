// middlewares/rateLimiter.js
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default;
const { client: redisClient } = require('../config/redis/redis');

/**
 * 🚀 HORIZONTAL SCALING: Shared Redis Store Factory
 * Each limiter MUST have a unique store instance with a unique prefix
 */
const createStore = (prefix) => new RedisStore({
  // @ts-expect-error - compatibility shim for redis v4
  sendCommand: (...args) => redisClient.sendCommand(args),
  prefix: `rl:${prefix}:`,
});

// 🔐 Global Rate Limiter – applies to all routes
const globalRateLimiter = rateLimit({
  windowMs: parseInt(process.env.GLOBAL_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.GLOBAL_LIMIT_MAX) || 300,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore('global'),
});

// 📘 Swagger Rate Limiter – more strict
const swaggerRateLimiter = rateLimit({
  windowMs: parseInt(process.env.SWAGGER_LIMIT_WINDOW_MS) || 1 * 60 * 1000,
  max: 60,
  message: 'Too many requests to Swagger docs. Try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore('swagger'),
});

// 🛡️ Auth Rate Limiter (Login/Signup) - Strict but fair
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many login attempts from this IP, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore('auth'),
});

const otpLimiter = rateLimit({
  windowMs: parseInt(process.env.OTP_LIMIT_WINDOW_MS) || 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many OTP requests. Please try again later.',
  store: createStore('otp'),
});

/** ─────────────────────────────
 *  Per-device + per-model keys
 *  ─────────────────────────────
 */
const perDeviceKeyGen = (req) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const uid = req.user?.userid || 'anon';
  const model = String(req.params.model || 'unknown').toLowerCase();
  const auid = String(req.params.auid || 'unknown').toUpperCase();
  return `${uid}:${ip}:${model}:${auid}`;
};

// 🗄️ DB JSON limiter (reads)
const dbRouteLimiter = rateLimit({
  windowMs: parseInt(process.env.DB_LIMIT_WINDOW_MS, 10) || 5 * 60 * 1000,
  max: parseInt(process.env.DB_LIMIT_MAX, 10) || 120,
  message: 'Too many DB reads for this device from your client. Please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req),
  store: createStore('db'),
});

// 📄 CSV export limiter (heavier)
const csvRouteLimiter = rateLimit({
  windowMs: parseInt(process.env.CSV_LIMIT_WINDOW_MS, 10) || 10 * 60 * 1000,
  max: parseInt(process.env.CSV_LIMIT_MAX, 10) || 20,
  message: 'CSV export rate limit exceeded for this device. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req),
  store: createStore('csv'),
});

module.exports = {
  globalRateLimiter,
  swaggerRateLimiter,
  otpLimiter,
  authLimiter,
  dbRouteLimiter,
  csvRouteLimiter,
};
