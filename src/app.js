const express = require('express');
const dotenv = require('dotenv');
const path = require('path');

// LOAD ENV FIRST
let envFile = process.env.NODE_ENV === 'development' ? '.env.development' : '.env';
dotenv.config({ path: path.resolve(__dirname, `../${envFile}`) });

const redoc = require('redoc-express');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger/swaggerOptions');

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

// ============================================
// MIDDLEWARE
// ============================================
const { globalRateLimiter, swaggerRateLimiter } = require('./middleware/rateLimiter');
const auditLogger = require('./middleware/auditLogger');
const auth = require('./middleware/docsAuthMiddleware');
const passport = require('./config/passport');
const googleRoutes = require('./modules/auth/google.routes');

const authenticateToken = require('./middleware/bearermiddleware');
const { getCsrfToken } = require('./middleware/csrfProtection');

const app = express();

app.use(passport.initialize());

app.use(express.static(path.join(__dirname, '../public'))); // Public is in root

// Docs Landing
app.get('/docs', auth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'docs-landing.html'));
});

// Swagger UI
app.use('/docs/swagger', auth, swaggerUi.serve);
// Note: swaggerSpec needs to be checked if it relies on existing routes. 
// If swaggerSpec scans 'routes/**/*.js', it will find old files.
// Ideally usage of swagger-jsdoc would scan 'src/**/*.js' too.
app.get('/docs/swagger', auth, swaggerUi.setup(swaggerSpec, {
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

const helmet = require('helmet');
const { dynamicCorsMiddleware } = require('./middleware/dynamicCors');

// 🔒 SECURITY: Dynamic CORS Configuration (Database-driven)
// Platform admins can configure allowed origins via API
// Falls back to environment variables if DB fails

app.use(globalRateLimiter);
app.use(helmet());
app.use(dynamicCorsMiddleware); // Dynamic CORS from database
app.use(express.json());
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
        app.use('/climate-docs', swaggerUi.serve);
        return swaggerUi.setup(swaggerSpec)(req, res, next);
    } else {
        redoc({ title: 'Crafted Climate', specUrl: '/climate-docs/swagger.json' })(req, res, next);
    }
});

// ============================================
// API ROUTES
// ============================================

app.use('/api', testRoutes);

// GOOGLE AUTH
app.use('/auth/google', googleRoutes);

// PLATFORM ADMIN - CORS MANAGEMENT
const corsAdminRoutes = require('./modules/admin/cors.routes');
app.use('/api/admin/cors', corsAdminRoutes);

// PLATFORM ADMIN - USER MANAGEMENT
const adminUserRoutes = require('./modules/admin/adminUser.routes');
app.use('/api/admin/users', adminUserRoutes);

// PLATFORM ADMIN - SUBSCRIPTION MANAGEMENT
const adminSubscriptionRoutes = require('./modules/admin/adminSubscription.routes');
app.use('/api/admin/subscriptions', adminSubscriptionRoutes);

// PLATFORM ADMIN - ORGANIZATION MANAGEMENT (EXTENDED)
const adminOrgRoutes = require('./modules/admin/adminOrganization.routes');
app.use('/api/admin/organizations', adminOrgRoutes);

// PLATFORM ADMIN - DEVICE MANAGEMENT
const adminDeviceRoutes = require('./modules/admin/adminDevice.routes');
app.use('/api/admin/devices', adminDeviceRoutes);

// PLATFORM ADMIN - ANALYTICS
const adminAnalyticsRoutes = require('./modules/admin/adminAnalytics.routes');
app.use('/api/admin/analytics', adminAnalyticsRoutes);

// PLATFORM ADMIN - SYSTEM CONFIGURATION
const systemConfigRoutes = require('./modules/admin/systemConfig.routes');
app.use('/api/admin/config', systemConfigRoutes);

// PLATFORM ADMIN - ANNOUNCEMENTS
const announcementRoutes = require('./modules/admin/announcement.routes');
app.use('/api/admin/announcements', announcementRoutes);

// PLATFORM ADMIN - AUDIT LOGS
const adminAuditRoutes = require('./modules/admin/adminAudit.routes');
app.use('/api/admin/audit-logs', adminAuditRoutes);

// PLATFORM ADMIN - API KEYS
const adminApiKeyRoutes = require('./modules/admin/adminApiKey.routes');
app.use('/api/admin/api-keys', adminApiKeyRoutes);

// PLATFORM ADMIN - SUPPORT TICKETS
const adminTicketRoutes = require('./modules/admin/adminTicket.routes');
app.use('/api/admin/support/tickets', adminTicketRoutes);

// USER - SUPPORT TICKETS
const userTicketRoutes = require('./modules/support/userTicket.routes');
app.use('/api/support/tickets', userTicketRoutes);

// USER - NOTIFICATIONS
const notificationRoutes = require('./modules/notification/notification.routes');
app.use('/api/notifications', notificationRoutes);

// PLATFORM ADMIN - NOTIFICATIONS
const adminNotificationRoutes = require('./modules/admin/adminNotification.routes');
app.use('/api/admin/notifications', adminNotificationRoutes);

// PLATFORM ADMIN - EMAIL TEMPLATES
const emailTemplateRoutes = require('./modules/admin/emailTemplate.routes');
app.use('/api/admin/email-templates', emailTemplateRoutes);

// NEW MODULES
// IMPORTANT: UserRoutes in routes/user/user.js expects /api/auth and /api/user.
// I need to check if user.routes.js is created correctly. 
// I will create user.routes.js in NEXT STEP.
app.use('/api/auth', userRoutes);
app.use('/api/user', userRoutes);

app.use('/api/org', organizationRoutes);


// NEW DEVICES
app.use('/api/devices', devicesRoutes);
app.use('/api', thresholdRoutes);

app.use('/api/subscriptions', subscriptionRoutes);
const analyticsRoutes = require('./modules/analytics/analytics.routes');
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', logsRoutes);

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
