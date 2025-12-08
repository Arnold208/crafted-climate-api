// middlewares/rateLimiter.js
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

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

/** ─────────────────────────────
 *  Per-device + per-model keys
 *  (prevents one client scraping many devices)
 *  If you have auth, we fold user id into the key too.
 *  ─────────────────────────────
 */
const perDeviceKeyGen = (req) => {
  const ip    = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const uid   = req.user?.userid || 'anon'; // JWT uses 'userid', not 'id'
  const model = String(req.params.model || 'unknown').toLowerCase();
  const auid  = String(req.params.auid || 'unknown').toUpperCase();
  return `${uid}:${ip}:${model}:${auid}`;
};

// 🗄️ DB JSON limiter (reads)
const dbRouteLimiter = rateLimit({
  windowMs: parseInt(process.env.DB_LIMIT_WINDOW_MS, 10) || 5 * 60 * 1000,  // 5 min
  max: parseInt(process.env.DB_LIMIT_MAX, 10) || 120,                       // 120 reads / 5 min / key
  message: 'Too many DB reads for this device from your client. Please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
keyGenerator: (req) => ipKeyGenerator(req),
});

// 📄 CSV export limiter (heavier)
const csvRouteLimiter = rateLimit({
  windowMs: parseInt(process.env.CSV_LIMIT_WINDOW_MS, 10) || 10 * 60 * 1000, // 10 min
  max: parseInt(process.env.CSV_LIMIT_MAX, 10) || 20,                         // 20 CSVs / 10 min / key
  message: 'CSV export rate limit exceeded for this device. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
keyGenerator: (req) => ipKeyGenerator(req),
});


module.exports = {
  globalRateLimiter,
  swaggerRateLimiter,
  otpLimiter,
  dbRouteLimiter,
  csvRouteLimiter,
};
