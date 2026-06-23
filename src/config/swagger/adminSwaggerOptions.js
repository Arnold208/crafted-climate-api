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
      title: 'CraftedClimate Backoffice Console API',
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

# CraftedClimate Backoffice Console API Documentation

This dedicated API documentation is for developers integrating the **Backoffice Control Console**. It contains only endpoints available to platform management roles: **Platform Admin**, **Supervisor**, and **Support**.

### **Role Privilege Matrix**
* **Admin (\`admin\`)**: Complete system authority, including CORS rules, system configurations, permanent deletions, plan definitions, and API key management.
* **Supervisor (\`supervisor\`)**: Mid-tier access to manage organizations, users, devices, subscription changes, announcements, and support ticket assignments. Restricted from CORS rules and permanent deletions.
* **Support (\`support\`)**: Read-only access to users, organizations, devices, and billing. Full read/reply/internal-note capabilities for customer support tickets.

---

## **Authorization Requirements**
All endpoints listed here require a valid JWT token:
\`\`\`
Authorization: Bearer <admin-jwt-token>
\`\`\`

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

        organizationId: {
          type: 'apiKey',
          in: 'header',
          name: 'x-org-id',
          description: 'The unique Identifier (ID) of the target organization workspace.'
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
      { bearerAuth: [] }
    ],

    tags: [
      { name: 'Authentication', description: 'Backoffice admin authentication — MFA login, OTP verification, and password reset' },
      { name: 'Support', description: 'Administrative support ticket monitoring, assignment, status tracking, and notes' },
      { name: 'Platform Admin - Subscription Management', description: 'Financial analytics, subscription overrides, and cancellations' },
      { name: 'Admin Devices', description: 'Global registry lookup, statistics, offline monitoring, and reassignment' },
      { name: 'Organizations (Platform Admin)', description: 'Tenant request reviews, document auditing, and state switches' },
      { name: 'Platform Admin - Plans', description: 'Plan specifications, GHS pricing, and resource limits' },
      { name: 'Platform Admin - Dashboard', description: 'Backoffice management dashboard stats and indicators' },
      { name: 'Platform Admin - Notifications', description: 'Broadcasting platform notifications and logs' },
      { name: 'Audit Logs', description: 'Platform-wide and tenant access logs' },
      { name: 'Analytics', description: 'Administrative revenue and usage charts' },
      { name: 'API Keys', description: 'System-level API key management' },
      { name: 'System Config', description: 'Platform maintenance and configurations' }
    ]
  },

  apis: [
    './src/modules/admin/**/*.js',
    './src/modules/organization/organizationManagement.routes.js',
    path.join(__dirname, '../../modules/admin/**/*.js').replace(/\\/g, '/'),
    path.join(__dirname, '../../modules/organization/organizationManagement.routes.js').replace(/\\/g, '/'),
    path.join(__dirname, '../../models/**/*.js').replace(/\\/g, '/')
  ]
};

const adminSwaggerSpec = swaggerJsdoc(options);
module.exports = adminSwaggerSpec;
