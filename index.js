const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const connectDB = require('./config/database/mongodb');
const { connectRedis } = require('./config/redis/redis'); // ✅ Add this line

const redoc = require('redoc-express');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger/swaggerOptions');
const basicAuth = require('express-basic-auth');

const testRoutes = require('./routes/test');
const manufacturerRoutes = require('./routes/devices/manufacturer/manufacturer');
const users = require('./routes/user/user');
const { globalRateLimiter, swaggerRateLimiter } = require('./middleware/rateLimiter');
const sensorModels = require('./routes/devices/sensorModel/sensorModel');
const registerSensor = require('./routes/devices/user/userdevice');
const otaUpdate = require('./routes/devices/ota/ota');
const deployment = require('./routes/devices/deployment/deployment');
const telemetry = require('./routes/devices/telemetry/telemetry');
const notecard = require('./routes/devices/notecard/envDeviceRoutes')
const notecardDeployment = require('./routes/devices/notecard/envDeploymentRoutes')
const threshold = require('./routes/devices/threshold/thresholdRoutes')
const admin_subscription = require('./routes/subscriptions/subscriptionAdminRoutes')
const user_subscription = require('./routes/subscriptions/subscriptionUserRoutes')

const secureMqtt = require('./routes/telemetry/mqtt_secure_msg');
const { setupRealtime } = require("./config/socket/socketio");
const { startTelemetryWorker } = require('./routes/telemetry/queue_worker/telemetryWorker');
const { startStatusWorker } = require('./routes/telemetry/queue_worker/statusWorker');
const { startFlushDirectCron } = require('./cron/flushEnqueueCron');
const { startUpdateRedisStatusCron } = require('./cron/updateRedisStatusCron');
const app = express();

// Serve static files from public directory
app.use(express.static('public'));

// Import auth middleware
const auth = require('./middleware/docsAuthMiddleware');

// Documentation landing page with authentication
app.get('/docs', auth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'docs-landing.html'));
});

// Swagger UI documentation with authentication
app.use('/docs/swagger', auth, swaggerUi.serve);
app.get('/docs/swagger', auth, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'CraftedClimate API Documentation',
}));

// ReDoc documentation with authentication
app.get('/docs/redoc', auth, redoc({
  title: 'CraftedClimate API Documentation',
  specUrl: '/docs/swagger-json',
  redocOptions: {
    theme: {
      typography: {
        fontFamily: 'Inter, sans-serif',
        headings: {
          fontFamily: 'Inter, sans-serif',
        },
        code: {
          fontFamily: 'JetBrains Mono, monospace',
        },
      },
    },
  },
}));

// Expose OpenAPI spec as JSON for ReDoc
app.get('/docs/swagger-json', (req, res) => {
  res.json(swaggerSpec);
});

let envFile;

if (process.env.NODE_ENV === 'development') {
  envFile = '.env.development';
} else {
  envFile = '.env';   // default for production or if NODE_ENV not set
}

dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });

// Connect to MongoDB
connectDB();

// Apply global rate limiting
app.use(globalRateLimiter);

// Parse incoming JSON
app.use(express.json());

// Swagger docs route (protected)
// Serve OpenAPI spec
app.get('/climate-docs/swagger.json', swaggerRateLimiter, (req, res) => {
  res.json(swaggerSpec);
});

// Auth middleware for docs
const docsAuth = basicAuth({
  users: { [process.env.SWAGGER_USERNAME]: process.env.SWAGGER_PASSWORD },
  challenge: true,
  unauthorizedResponse: (req) =>
    req.auth ? 'Credentials rejected' : 'No credentials provided',
});

// Serve logo for documentation
app.get('/climate-docs/logo', swaggerRateLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'config/mail/logo/splash.png'));
});

// Documentation UI router
app.use('/climate-docs', swaggerRateLimiter, docsAuth, (req, res, next) => {
  const useSwagger = req.query.ui === 'swagger';

  if (useSwagger) {
    // Serve Swagger UI and its assets
    app.use('/climate-docs', swaggerUi.serve);
    return swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'CraftedClimate API Documentation',
      customfavIcon: '/climate-docs/logo',
      customCss: `
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap');
        
        .swagger-ui {
          font-family: 'Montserrat', sans-serif;
        }
        .swagger-ui .topbar { display: none }
        .swagger-ui img { content: url('/climate-docs/logo'); max-width: 300px; margin: 20px auto; display: block; }
        .swagger-ui .info { margin: 20px 0 }
        .swagger-ui .scheme-container { box-shadow: none }
        .swagger-ui .opblock-tag { font-family: 'Montserrat', sans-serif; font-weight: 600; }
        .swagger-ui .opblock .opblock-summary-operation-id { font-family: 'Montserrat', sans-serif; }
        .swagger-ui table thead tr td, .swagger-ui table thead tr th { font-family: 'Montserrat', sans-serif; }
        .swagger-ui .btn { font-family: 'Montserrat', sans-serif; }
        .swagger-ui select { font-family: 'Montserrat', sans-serif; }
        .swagger-ui .auth-wrapper .authorize { background-color: #2C3E50; border-color: #2C3E50; }
        .swagger-ui .auth-wrapper .authorize svg { fill: white; }
        .swagger-ui .auth-container { box-shadow: 0 0 8px rgba(0,0,0,0.1); }
        .swagger-ui .opblock.opblock-post { background: rgba(73, 204, 144, 0.1); }
        .swagger-ui .opblock.opblock-get { background: rgba(97, 175, 254, 0.1); }
        .swagger-ui .opblock.opblock-delete { background: rgba(249, 62, 62, 0.1); }
        .swagger-ui .opblock.opblock-put { background: rgba(252, 161, 48, 0.1); }
      `,
      swaggerOptions: {
        persistAuthorization: true,
        defaultModelsExpandDepth: 3,
        displayRequestDuration: true,
        filter: true,
        deepLinking: true
      }
    })(req, res, next);
  } else {
    // Serve ReDoc by default
    redoc({
      title: 'CraftedClimate API Documentation',
      specUrl: '/climate-docs/swagger.json',
      redocOptions: {
        theme: {
          logo: {
            gutter: '20px'
          },
          colors: {
            primary: {
              main: '#2C3E50'
            },
            success: {
              main: '#49cc90'
            },
            warning: {
              main: '#fca130'
            },
            error: {
              main: '#f93e3e'
            },
            gray: {
              50: '#f8f9fa',
              100: '#f1f3f5'
            }
          },
          typography: {
            fontSize: '14px',
            lineHeight: '1.5em',
            fontFamily: 'Montserrat, sans-serif',
            headings: {
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: '600'
            },
            code: {
              fontFamily: 'Roboto Mono, monospace',
              fontSize: '13px'
            }
          },
          sidebar: {
            backgroundColor: '#f8f9fa',
            textColor: '#2C3E50',
            activeTextColor: '#2C3E50',
            width: '300px'
          },
          rightPanel: {
            backgroundColor: '#2C3E50',
            textColor: '#ffffff'
          }
        },
        hideDownloadButton: true,
        expandResponses: '200,201',
        jsonSampleExpandLevel: 2,
        requiredPropsFirst: true,
        sortPropsAlphabetically: true,
        expandSingleSchemaField: true,
        showExtensions: true,
        noAutoAuth: false,
        pathInMiddlePanel: true,
        hideHostname: false
      }
    })(req, res, next);
  }
});


// API Routes
app.use('/api', testRoutes);
app.use('/api/devices/manufacturer', manufacturerRoutes);
app.use('/api/auth', users);
app.use('/api/user', users);
app.use('/api/devices', sensorModels);
app.use('/api/devices', registerSensor);
app.use('/api/devices', otaUpdate);
app.use('/api/devices', deployment);
app.use('/api/telemetry', telemetry);
app.use('/api/devices', notecard)
app.use('/api/devices', notecardDeployment)
app.use('/api', threshold)
app.use('/api/subscriptions/admin', admin_subscription)
app.use('/api/subscriptions/user', user_subscription)

// Analytics Routes
app.use('/api/analytics', require('./routes/analytics/analytics'));


// ✅ Connect Redis before starting server
connectRedis()
  .then(() => {

    startTelemetryWorker();
    //startStatusWorker();
    startFlushDirectCron();
    startUpdateRedisStatusCron();


    const PORT = process.env.PORT || 3000;

    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
      console.log(`📘 Swagger docs available at http://localhost:${PORT}/climate-docs`);
    });

    setupRealtime(server);
  })
  .catch((err) => {
    console.error('❌ Failed to connect to Redis:', err);
    process.exit(1); // Exit app if Redis fails
  });

secureMqtt.connectSecureMqtt();

