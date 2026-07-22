const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

// API_URL is the canonical backend server URL.
// In dev:  process.env.API_URL = http://localhost:3000  (from .env.development)
// In prod: process.env.API_URL = https://cctelemetry-api-prod-...azurewebsites.net  (from Azure)
let apiUrl  = process.env.API_URL  || `http://localhost:${process.env.PORT || 3000}`;
const isProd  = process.env.NODE_ENV === 'production';

if (apiUrl && !apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
  apiUrl = `${isProd ? 'https' : 'http'}://${apiUrl}`;
}

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
- Org API Keys (\`cc_live_...\`) for programmatic access — generate, rotate, revoke, restrict by IP/Origin
- WebSocket Real-Time Telemetry & Status Bridge
- Plan-based feature gating (freemium → starter → premium → enterprise)

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
const socket = io(process.env.API_URL || 'https://api.craftedclimate.org', {
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

## **Paystack Payment & Onboarding Workflow**
The system integrates with **Paystack** for handling subscription payments (specifically GHS and other configured currencies).

### **1. Onboarding Payment Flow (Organization Creation)**
When a user wants to create a new verified organization on a paid plan, the flow is as follows:
1. **Submit Organization Request**: The client calls \`POST /api/org/request-creation\` with organization details and a selected \`planId\` and \`billingCycle\`.
2. **Obtain Checkout Link**: If the selected plan is a paid plan (price > 0), the response contains \`checkoutUrl\` (a Paystack authorization URL) and a \`request\` object with status \`payment_pending\`.
3. **Redirect to Paystack**: The client redirects the user to \`checkoutUrl\` to complete the payment.
4. **Webhook Notification**: Upon successful payment, Paystack sends a \`charge.success\` webhook to \`/api/subscriptions/paystack/webhook\`.
5. **Request Approved for Review**: The backend verifies the webhook signature, logs the transaction, updates the onboarding request status to \`pending\`, and updates the payment status to \`success\`.
6. **Platform Admin Approval**: A platform admin reviews the documents/request and approves it via \`PUT /api/org/admin/creation-requests/{requestId}/approve\`, which provisions the organization and its initial subscription.

### **2. Payment Retry Flow**
If a payment fails or the checkout window expires:
1. The requester calls \`POST /api/org/creation-requests/{requestId}/retry-payment\`.
2. The server generates a new Paystack checkout transaction and returns a new \`checkoutUrl\`.
3. The user completes payment via Paystack, triggering the same webhook flow to update the request to \`pending\`.

### **3. Webhook Handling & Signature Verification**
- **Endpoint**: \`POST /api/subscriptions/paystack/webhook\` (Public)
- **Signature Header**: \`X-Paystack-Signature\` containing the HMAC SHA512 hash of the raw request body signed with the \`PAYSTACK_SECRET_KEY\`.
- **Note**: In the development environment, signature verification falls back to a warning/bypass if no key is configured, but is strictly enforced in production.

---
`,
      contact: {
        name: 'CraftedClimate Support',
        email: process.env.SUPPORT_EMAIL || 'support@craftedclimate.org',
        url: process.env.WEBSITE_URL ? `${process.env.WEBSITE_URL}/support` : 'https://console.craftedclimate.co/support'
      }
    },

    servers: [
      {
        url: apiUrl,
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
          name: 'x-api-key',
          description: 'Organization API key (format: `cc_live_XXXXXXXX_...`). Generated per org via `POST /api/org/:orgId/api-keys`. Supports IP and origin restrictions, rotation, and revocation. Scoped by permissions: `telemetry:read`, `telemetry:write`, `devices:read`, `devices:write`, `analytics:read`.'
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
            netMode: { type: 'string', enum: ['cellular', 'wifi', 'satellite'], example: 'cellular' },
            acquisitionType: { type: 'string', enum: ['purchase', 'maas'], example: 'purchase' },
            hardwareVersion: { type: 'string', nullable: true },
            firmwareVersion: { type: 'string', nullable: true },
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
      { name: 'Organizations (Platform User)', description: 'Organization creation requests, billing checkouts, and details for platform users' },
      { name: 'Organizations (Platform Admin)', description: 'Platform admin endpoints to approve/reject organization creation requests' },
      { name: 'Manufacturer', description: 'Device manufacturing and identity management' },
      { name: 'Device Registry', description: 'Technical device registration and tracking' },
      { name: 'Sensor Models', description: 'Sensor hardware definitions and parameters' },
      { name: 'Deployments', description: 'Deployment grouping and organizational hierarchy' },
      { name: 'Telemetry', description: 'Device telemetry ingestion and retrieval' },
      { name: 'Thresholds', description: 'Alert threshold configuration and monitoring' },
      { name: 'Subscriptions', description: 'Subscription management and billing' },
      { name: 'Organization Subscriptions', description: 'Organization-scoped plan upgrades, downgrades, and billing cycles' },
      { name: 'Subscription Plans', description: 'Platform admin endpoints to manage available subscription packages' },
      { name: 'Audit Logs', description: 'Access audit logs for organizations and platform' },
      { name: 'Support', description: 'Ticketing and customer support system' },
      { name: 'Analytics', description: 'System-wide and organization-specific analytics' },
      { name: 'API Keys', description: 'Management of organization API keys' },
      { name: 'Organization - API Keys', description: 'Generate, list, rotate, revoke, and view usage stats for org-scoped API keys. Keys follow the format cc_live_XXXXXX_... and support IP/Origin restrictions and plan-based limits.' },
      { name: 'Organization Security', description: 'Manage allowed IP addresses and origins for org API key access. Changes take effect immediately via Redis cache invalidation.' },
      { name: 'System Config', description: 'Platform-level system settings' },
      { name: 'Notecard', description: 'Blues Notecard integration and management' },
      { name: 'Firmware', description: 'OTA updates and firmware management' },
      {
        name: 'MRV Engine - Catalogue',
        description: 'MRV standards, methodology versions, sensor capability mappings, and emission factors. Read-only catalogue data seeded on startup.'
      },
      {
        name: 'MRV Engine - Projects',
        description: 'MRV project lifecycle: create, update, add sites, partners, members, methodology assignments, applicability and readiness assessments.'
      },
      {
        name: 'MRV Engine - Monitoring',
        description: 'Monitoring period management: create, open (DRAFT → OPEN), close (OPEN → CLOSED). Lists observations within a period.'
      },
      {
        name: 'MRV Engine - Evidence and Ingest',
        description: 'All evidence collection: sensor installations (link, maintenance, replace), file uploads, manual meter readings, CSV bulk imports, calibration records, and HTTP telemetry ingest.'
      },
      {
        name: 'MRV Engine - Data Quality',
        description: 'Observation quality control: quarantine review dashboard, manual approve (QUARANTINED → MANUALLY_APPROVED), void (→ VOIDED), and summary statistics.'
      },
      {
        name: 'MRV Engine - Assurance and Audit',
        description: 'Third-party verification (VVB): verification cases, findings (CAR/FAR), verification opinion. Registry event logging (Verra, Ghana CMO). Structured MRV audit trail.'
      },
      {
        name: 'MRV Engine - Webhooks',
        description: 'Outbound webhooks: register partner endpoints, list deliveries, test fire, delete. All deliveries are HMAC-SHA256 signed (X-MRV-Signature header).'
      }
    ]
  },

  apis: [
    './src/modules/**/*.js',  // Use forward slashes relative to project root involves changing execution context,
    // better to use relative to __dirname but ensuring forward slashes
    path.join(__dirname, '../../modules/**/*.js').replace(/\\/g, '/'),
    path.join(__dirname, '../../models/**/*.js').replace(/\\/g, '/'),
    // MRV Engine shared schema components (must be scanned before routes that reference them)
    path.join(__dirname, './mrvSwaggerComponents.js').replace(/\\/g, '/')
  ]
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;
