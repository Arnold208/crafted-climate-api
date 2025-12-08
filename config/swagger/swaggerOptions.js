const swaggerJsdoc = require('swagger-jsdoc');

const isProd = process.env.NODE_ENV === 'production';
const prodUrl = process.env.PROD_URL;

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'CraftedClimate API',
      version: '2.0.0',
      description: `
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');
  
  .markdown-body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    line-height: 1.6;
    color: #1a1a1a;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 24px;
  }
</style>

<img src="/climate-docs/logo" alt="CraftedClimate Logo" style="display:block;margin:20px auto;max-width:300px;">

# CraftedClimate API Documentation

This API provides tenant-isolated, multi-organizational access for climate sensor deployments and data analytics.

### **Architecture**
- Multi-Tenant (Organization-Based)
- Role-Based Access Control (RBAC)
- JWT Authentication
- API Key for Telemetry Devices
- WebSocket Real-Time Telemetry

---

## **Required Headers for Organization APIs**
Most endpoints need:

\`\`\`
Authorization: Bearer <jwt-token>
x-org-id: org_xxx   ← required for org-scoped routes
\`\`\`

---

## Real-Time WebSocket Example

\`\`\`javascript
const socket = io('https://api.craftedclimate.org', {
  transports: ['websocket'],
  auth: { token: JWT_ACCESS_TOKEN }
});
socket.emit('join', 'device-auid');
socket.on('telemetry', (data) => console.log(data));
\`\`\`

---

## Example Telemetry Payload

\`\`\`json
{
  "auid": "GH-YV91YJL2DIN_TWBS9W7AR",
  "temperature_water": 26.4,
  "ph": 7.2,
  "ec": 0.48,
  "lux": 325,
  "battery": 88,
  "timestamp": 1762980213
}
\`\`\`

---
`,
      contact: {
        name: 'CraftedClimate Support',
        email: 'support@craftedclimate.com',
        url: 'https://craftedclimate.com/support'
      }
    },

    servers: [
      {
        url: isProd ? prodUrl : 'http://localhost:3000',
        description: isProd ? 'Production Server' : 'Development Server'
      }
    ],

    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token from login endpoint'
        },

        // NEW — Required for all multi-tenant org-scoped routes
        orgIdHeader: {
          type: 'apiKey',
          in: 'header',
          name: 'x-org-id',
          description: 'Active Organization Context'
        },

        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-KEY',
          description: 'API key for device telemetry'
        }
      },

      schemas: {
        User: {
          type: 'object',
          properties: {
            userid: { type: 'string' },
            email: { type: 'string' },
            role: { type: 'string', example: 'admin' },
            organizations: { type: 'array', items: { type: 'string' } }
          }
        },

        Organization: {
          type: 'object',
          properties: {
            organizationId: { type: 'string' },
            name: { type: 'string' },
            collaborators: { type: 'array' }
          }
        },

        Device: {
          type: 'object',
          properties: {
            auid: { type: 'string' },
            devid: { type: 'string' },
            model: { type: 'string' },
            organization: { type: 'string' }
          }
        },

        Deployment: {
          type: 'object',
          properties: {
            deploymentid: { type: 'string' },
            organizationId: { type: 'string' },
            devices: { type: 'array', items: { $ref: '#/components/schemas/Device' } }
          }
        }
      }
    },

    // Default security
    security: [
      { bearerAuth: [] },
      { orgIdHeader: [] }
    ],

    tags: [
      { name: 'Authentication', description: 'User signup, login, and profile management' },
      { name: 'Organizations', description: 'Multi-tenant organization management with RBAC and membership' },
      { name: 'Devices', description: 'Device registration, management, and control (manufacturer, sensor models, OTA updates, notecard)' },
      { name: 'Deployments', description: 'Deployment grouping, device assignment, and organizational hierarchy' },
      { name: 'Telemetry', description: 'Device telemetry ingestion, retrieval, and real-time data streaming' },
      { name: 'Thresholds', description: 'Alert threshold configuration and monitoring' },
      { name: 'Subscriptions', description: 'Subscription management, billing, and plan feature enforcement' }
    ]
  },
  
  apis: [
    // Authentication & User Routes
    './routes/user/**/*.js',
    
    // Organization Routes (RBAC + Multi-tenant)
    './routes/organizations/**/*.js',
    
    // Device Routes (Registration, RBAC, Management)
    './routes/devices/user/**/*.js',
    './routes/devices/manufacturer/**/*.js',
    './routes/devices/sensorModel/**/*.js',
    './routes/devices/ota/**/*.js',
    './routes/devices/notecard/**/*.js',
    
    // Deployment Routes (Grouping & RBAC)
    './routes/devices/deployment/**/*.js',
    
    // Telemetry Routes (Ingest & Read)
    './routes/devices/telemetry/**/*.js',
    
    // Threshold & Monitoring Routes
    './routes/devices/threshold/**/*.js',
    
    // Subscription Management Routes
    './routes/subscriptions/**/*.js',
    
    // Legacy/Test Routes
    './routes/test.js'
  ]
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;
