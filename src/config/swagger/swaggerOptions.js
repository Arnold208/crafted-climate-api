const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

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
- API Key for Telemetry Devices & Factory Manufacturing
- WebSocket Real-Time Telemetry & Status Bridge

---

## **Required Headers for Organization APIs**
Most endpoints need:

\`\`\`
Authorization: Bearer <jwt-token>
x-org-id: org_xxx   ← required for org-scoped routes
\`\`\`

---

## **Real-Time WebSocket Telemetry Connection**
Clients can listen to live telemetry events by establishing a WebSocket connection and joining a device room:

\`\`\`javascript
const socket = io('https://api.craftedclimate.org', {
  transports: ['websocket'],
  auth: { token: JWT_ACCESS_TOKEN }
});
socket.emit('join', 'device-auid');
socket.on('telemetry', (data) => console.log(data));
\`\`\`

---

## **Real-Time Device Status Synchronization (Zero Stale UI)**
To support reactive interfaces, the backend includes a status synchronization bridge. Instead of polling REST endpoints to check if a sensor is online or offline, client dashboards can join a device room and subscribe to the \`device:status\` event.

### **1. Join Room**
\`\`\`javascript
socket.emit('join', 'device-auid', (response) => {
  if (response.ok) {
    console.log(\`Successfully joined room for device: \${response.room}\`);
  } else {
    console.error(\`Failed to join room: \${response.error}\`);
  }
});
\`\`\`

### **2. Listen for Real-Time Status Changes**
\`\`\`javascript
socket.on('device:status', (event) => {
  console.log(\`Device AUID:\`, event.auid);
  console.log(\`Connectivity Status:\`, event.status);      // 'online', 'offline', 'inactive', 'disabled'
  console.log(\`Operational State:\`, event.state);         // 'active', 'inactive', 'disabled'
  console.log(\`State Changed At:\`, event.stateChangedAt);
  console.log(\`Changed By (userid):\`, event.changedBy);
  console.log(\`Broadcast Timestamp:\`, event.ts);
});
\`\`\`

---

## **Device Operational States & Status**
Sensors separate **connectivity status** from **intentional operational state**:

- **Connectivity Status (\`status\`)**:
  - \`online\`: Device is active and actively sending heartbeat telemetry.
  - \`offline\`: Device has stopped reporting and exceeded its alert threshold.
- **Operational State (\`state\`)**:
  - \`active\` (Default): The device is deployed. Heartbeats are monitored, and alerts are dispatched if it goes offline.
  - \`inactive\`: Deliberately powered down or removed from deployment by an owner/admin. Offline alerts are automatically **suppressed**, and heartbeat monitoring is paused.
  - \`disabled\`: Automatically set by the system if a device has remained \`inactive\` for more than 30 consecutive days. All alert processing and heartbeat checks are disabled.

*To change a device state programmatically, call:*
\`PUT /api/devices/device/:auid/state\` with request body \`{ "state": "inactive" }\`.

---

## **Example Telemetry Payload**

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

        // Required for all multi-tenant org-scoped routes
        organizationId: {
          type: 'apiKey',
          in: 'header',
          name: 'x-org-id',
          description: 'The unique Identifier (ID) of the target organization workspace.'
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
      { organizationId: [] }
    ],

    tags: [
      { name: 'Authentication', description: 'User signup, login, and profile management' },
      { name: 'Organizations', description: 'Multi-tenant organization management with RBAC and membership' },
      // { name: 'Devices', description: 'Device registration and general management' }, // Removed as duplicate
      { name: 'Manufacturer', description: 'Device manufacturing and identity management' },
      { name: 'Device Registry', description: 'Technical device registration and tracking' },
      { name: 'Sensor Models', description: 'Sensor hardware definitions and parameters' },
      { name: 'Deployments', description: 'Deployment grouping and organizational hierarchy' },
      { name: 'Telemetry', description: 'Device telemetry ingestion and retrieval' },
      { name: 'Thresholds', description: 'Alert threshold configuration and monitoring' },
      { name: 'Subscriptions', description: 'Subscription management and billing' },
      { name: 'Audit Logs', description: 'Access audit logs for organizations and platform' },
      { name: 'Support', description: 'Ticketing and customer support system' },
      { name: 'Analytics', description: 'System-wide and organization-specific analytics' },
      { name: 'API Keys', description: 'Management of organization API keys' },
      { name: 'System Config', description: 'Platform-level system settings' },
      { name: 'Notecard', description: 'Blues Notecard integration and management' },
      { name: 'Firmware', description: 'OTA updates and firmware management' }
    ]
  },

  apis: [
    './src/modules/**/*.js',  // Use forward slashes relative to project root involves changing execution context, 
    // better to use relative to __dirname but ensuring forward slashes
    path.join(__dirname, '../../modules/**/*.js').replace(/\\/g, '/'),
    path.join(__dirname, '../../models/**/*.js').replace(/\\/g, '/')
  ]
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;
