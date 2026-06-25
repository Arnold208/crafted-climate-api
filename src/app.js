const express = require('express');
const dotenv = require('dotenv');
const path = require('path');

// LOAD ENV FIRST
let envFile = process.env.NODE_ENV === 'development' ? '.env.development' : '.env';
dotenv.config({ path: path.resolve(__dirname, `../${envFile}`) });

const redoc = require('redoc-express');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger/swaggerOptions');
const adminSwaggerSpec = require('./config/swagger/adminSwaggerOptions');

const basicAuth = require('express-basic-auth');

// ============================================
// MODULE IMPORTS
// ============================================
const userRoutes = require('./modules/user/user.routes');
const telemetryRoutes = require('./modules/telemetry/telemetry.routes');
const organizationRoutes = require('./modules/organization/organization.routes');
const devicesRoutes = require('./modules/devices/devices.routes');
const thresholdRoutes = require('./modules/devices/threshold/threshold.routes');
const subscriptionRoutes = require('./modules/subscription/subscription.routes');
const logsRoutes = require('./modules/logs/logs.routes');
const testRoutes = require('./modules/test/test.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const flowRoutes = require('./modules/devices/flow/flow.routes');

// ============================================================
// MRV ENGINE — Measurement, Reporting and Verification
// ============================================================
const { mrvRouter, vvbRouter } = require('./modules/mrv/mrv.routes');
const mrvIngestRoutes = require('./modules/mrv/evidence/ingest.routes');

// PLATFORM ADMIN - CORS MANAGEMENT
const corsAdminRoutes = require('./modules/admin/cors.routes');
// PLATFORM ADMIN - USER MANAGEMENT
const adminUserRoutes = require('./modules/admin/adminUser.routes');
// PLATFORM ADMIN - SUBSCRIPTION MANAGEMENT
const adminSubscriptionRoutes = require('./modules/admin/adminSubscription.routes');
// PLATFORM ADMIN - ORGANIZATION MANAGEMENT (EXTENDED)
const adminOrgRoutes = require('./modules/admin/adminOrganization.routes');
// PLATFORM ADMIN - DEVICE MANAGEMENT
const adminDeviceRoutes = require('./modules/admin/adminDevice.routes');
// PLATFORM ADMIN - ANALYTICS
const adminAnalyticsRoutes = require('./modules/admin/adminAnalytics.routes');
// PLATFORM ADMIN - SYSTEM CONFIGURATION
const systemConfigRoutes = require('./modules/admin/systemConfig.routes');
// PLATFORM ADMIN - ANNOUNCEMENTS
const announcementRoutes = require('./modules/admin/announcement.routes');
// PLATFORM ADMIN - AUDIT LOGS
const adminAuditRoutes = require('./modules/admin/adminAudit.routes');
// PLATFORM ADMIN - API KEYS
const adminApiKeyRoutes = require('./modules/admin/adminApiKey.routes');
// PLATFORM ADMIN - SUPPORT TICKETS
const adminTicketRoutes = require('./modules/admin/adminTicket.routes');
// USER - SUPPORT TICKETS
const userTicketRoutes = require('./modules/support/userTicket.routes');
// USER - NOTIFICATIONS
const notificationRoutes = require('./modules/notification/notification.routes');
// PLATFORM ADMIN - NOTIFICATIONS
const adminNotificationRoutes = require('./modules/admin/adminNotification.routes');
// PLATFORM ADMIN - EMAIL TEMPLATES
const emailTemplateRoutes = require('./modules/admin/emailTemplate.routes');
// PLATFORM ADMIN - LOYALTY / POINTS SYSTEM
const adminLoyaltyRoutes  = require('./modules/admin/adminLoyalty.routes');
// ANALYTICS
// const analyticsRoutes = require('./modules/analytics/analytics.routes'); // Duplicate removed

// ============================================
// MIDDLEWARE
// ============================================
const { globalRateLimiter, swaggerRateLimiter } = require('./middleware/rateLimiter');
const auditLogger = require('./middleware/auditLogger');
const auth = require('./middleware/docsAuthMiddleware');
const adminAuth = require('./middleware/adminDocsAuthMiddleware');
const passport = require('./config/passport');
const googleRoutes = require('./modules/auth/google.routes');

const authenticateToken = require('./middleware/bearermiddleware');
const { getCsrfToken } = require('./middleware/csrfProtection');

// ============================================
// SESSION
// ============================================
const buildSessionMiddleware = require('./config/session');
const { populateUserFromSession } = require('./middleware/sessionMiddleware');
const sessionRoutes = require('./modules/auth/session.routes');

const app = express();

// Trust proxy for rate limiting behind load balancers/proxies
app.set('trust proxy', 1);

app.use(passport.initialize());

app.use(express.static(path.join(__dirname, '../public'))); // Public is in root

// Docs Landing
app.get('/docs', auth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'docs-landing.html'));
});

// Swagger UI
app.use('/docs/swagger', auth, swaggerUi.serveFiles(swaggerSpec), swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'CraftedClimate API Documentation',
}));

// ReDoc
app.get('/docs/redoc', auth, redoc({
    title: 'CraftedClimate API Documentation',
    specUrl: '/docs/swagger-json',
    redocOptions: { theme: { typography: { fontFamily: 'Inter, sans-serif' } } },
}));

app.get('/docs/swagger-json', (req, res) => res.json(swaggerSpec));

// Swagger UI (Backoffice / Admin Developer Docs)
app.use('/docs/admin-swagger', adminAuth, swaggerUi.serveFiles(adminSwaggerSpec), swaggerUi.setup(adminSwaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'CraftedClimate Backoffice API Documentation',
}));

// Admin ReDoc
app.get('/docs/admin-redoc', adminAuth, redoc({
    title: 'CraftedClimate Backoffice API Documentation',
    specUrl: '/docs/admin-swagger-json',
    redocOptions: { theme: { typography: { fontFamily: 'Inter, sans-serif' } } },
}));

app.get('/docs/admin-swagger-json', (req, res) => res.json(adminSwaggerSpec));

const helmet = require('helmet');
const { dynamicCorsMiddleware } = require('./middleware/dynamicCors');

// 🔒 SECURITY: Dynamic CORS Configuration (Database-driven)
// Platform admins can configure allowed origins via API
// Falls back to environment variables if DB fails

app.use(globalRateLimiter);
app.use(helmet());
app.use(dynamicCorsMiddleware); // Dynamic CORS from database
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

// ── Session middleware ────────────────────────────────────────────────────────
// Must come AFTER express.json but BEFORE routes.
// Sets req.session on every request.
// populateUserFromSession then reads req.session.user → req.user for convenience.
// Neither middleware rejects unauthenticated requests — that is the job of route guards.
app.use(buildSessionMiddleware());
app.use(populateUserFromSession);
// ─────────────────────────────────────────────────────────────────────────────

app.use(auditLogger);

// Docs JSON (Protected)
app.get('/climate-docs/swagger.json', swaggerRateLimiter, (req, res) => res.json(swaggerSpec));

// Docs Auth
const docsAuth = basicAuth({
    users: { [process.env.SWAGGER_USERNAME]: process.env.SWAGGER_PASSWORD },
    challenge: true,
    unauthorizedResponse: (req) => req.auth ? 'Credentials rejected' : 'No credentials provided',
});

// Logo
app.get('/climate-docs/logo', swaggerRateLimiter, (req, res) => {
    res.sendFile(path.join(__dirname, 'config/mail/logo/splash.png'));
});

// Docs Router
app.use('/climate-docs', swaggerRateLimiter, docsAuth, (req, res, next) => {
    // ... legacy docs logic ...
    const useSwagger = req.query.ui === 'swagger';
    if (useSwagger) {
        const router = express.Router();
        router.use('/', swaggerUi.serveFiles(swaggerSpec), swaggerUi.setup(swaggerSpec));
        return router(req, res, next);
    } else {
        redoc({ title: 'Crafted Climate', specUrl: '/climate-docs/swagger.json' })(req, res, next);
    }
});

// ============================================
// API ROUTES
// ============================================

app.use('/api', testRoutes);

// DEV-ONLY: Test setup helpers (auto-verify, force-plan, etc.)
// Not loaded in production — route itself also guards NODE_ENV
if (process.env.NODE_ENV === 'development') {
  const testHelpersRoutes = require('./modules/test/testHelpers.routes');
  app.use('/api/test-helpers', testHelpersRoutes);
}

// GOOGLE AUTH
app.use('/auth/google', googleRoutes);

// SESSION AUTH (browser dashboard + partner portals)
// POST   /api/auth/session/login   — credential login → sets cc.sid cookie
// DELETE /api/auth/session/logout  — destroys session + clears cookie
// GET    /api/auth/session/me      — returns current session user
// PATCH  /api/auth/session/org     — switch active org within session
app.use('/api/auth/session', sessionRoutes);

// PLATFORM ADMIN - CORS MANAGEMENT
app.use('/api/admin/cors', corsAdminRoutes);

// PLATFORM ADMIN - USER MANAGEMENT
app.use('/api/admin/users', adminUserRoutes);

// PLATFORM ADMIN - SUBSCRIPTION MANAGEMENT
app.use('/api/admin/subscriptions', adminSubscriptionRoutes);

// PLATFORM ADMIN - ORGANIZATION MANAGEMENT
app.use('/api/admin/organizations', adminOrgRoutes);

// PLATFORM ADMIN - DEVICE MANAGEMENT
app.use('/api/admin/devices', adminDeviceRoutes);

// PLATFORM ADMIN - ANALYTICS
app.use('/api/admin/analytics', adminAnalyticsRoutes);

// PLATFORM ADMIN - SYSTEM CONFIGURATION
app.use('/api/admin/config', systemConfigRoutes);

// PLATFORM ADMIN - LOYALTY / POINTS CONFIG
app.use('/api/admin/loyalty', adminLoyaltyRoutes);

// PLATFORM ADMIN - ANNOUNCEMENTS
app.use('/api/admin/announcements', announcementRoutes);

// PLATFORM ADMIN - AUDIT LOGS
app.use('/api/admin/audit-logs', adminAuditRoutes);

// PLATFORM ADMIN - API KEYS
app.use('/api/admin/api-keys', adminApiKeyRoutes);

// PLATFORM ADMIN - SUPPORT TICKETS
app.use('/api/admin/support/tickets', adminTicketRoutes);

// USER - SUPPORT TICKETS
app.use('/api/support/tickets', userTicketRoutes);

// USER - NOTIFICATIONS
app.use('/api/notifications', notificationRoutes);

// PLATFORM ADMIN - NOTIFICATIONS
app.use('/api/admin/notifications', adminNotificationRoutes);

// PLATFORM ADMIN - EMAIL TEMPLATES
app.use('/api/admin/email-templates', emailTemplateRoutes);

// NEW MODULES
// IMPORTANT: UserRoutes in routes/user/user.js expects /api/auth and /api/user.
// I need to check if user.routes.js is created correctly. 
// I will create user.routes.js in NEXT STEP.
app.use('/api/auth', userRoutes);
app.use('/api/user', userRoutes);
app.use('/api/users', userRoutes);

app.use('/api/org', organizationRoutes);


// NEW DEVICES
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/devices/flow', flowRoutes);
app.use('/api/devices', devicesRoutes);
app.use('/api', thresholdRoutes);

app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/subscriptions/paystack', require('./modules/subscription/paystackWebhook.routes'));
app.use('/api/v1/payments', require('./modules/subscription/paystackWebhook.routes'));
app.use('/api/webhooks', require('./modules/webhook/webhook.routes'));
const adminPlanRoutes = require('./modules/admin/adminPlan.routes');
app.use('/api/admin/plans', adminPlanRoutes);
const analyticsRoutes = require('./modules/analytics/analytics.routes');
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/logs', logsRoutes);

// ============================================================
// MRV ENGINE ROUTES
// All routes under /api/mrv use tag 'MRV Engine' in Swagger docs
// ============================================================
app.use('/api/mrv', mrvRouter);
app.use('/api/ingest', mrvIngestRoutes);

// ============================================================
// VVB DATA ROOM — Validation/Verification Body read-only access
// Uses scoped VVB API key auth (not JWT) — mounted separately
// ============================================================
app.use('/api/vvb', vvbRouter);

// ============================================
// CSRF TOKEN ENDPOINT
// ============================================
app.get('/api/csrf-token', authenticateToken, getCsrfToken);

// ============================================
// ERROR HANDLING (Must be last)
// ============================================

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`,
        errorCode: 'NOT_FOUND'
    });
});

// Global Error Handler
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

module.exports = app;
