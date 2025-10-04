const swaggerJsdoc = require('swagger-jsdoc');

const isProd = process.env.NODE_ENV === 'production';
const prodUrl = process.env.PROD_URL;

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'CraftedClimate API',
      version: '1.0.0',
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
  .markdown-body code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.9em;
    background: #f6f8fa;
    border-radius: 4px;
    padding: 0.2em 0.4em;
  }
  .markdown-body pre {
    background: #f6f8fa;
    border-radius: 8px;
    padding: 16px;
    margin: 16px 0;
  }
  .markdown-body table {
    border-collapse: separate;
    border-spacing: 0;
    width: 100%;
    margin: 16px 0;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }
  .markdown-body th {
    background: #f6f8fa;
    padding: 12px 16px;
    text-align: left;
    font-weight: 600;
  }
  .markdown-body td {
    padding: 12px 16px;
    border-top: 1px solid #eaecef;
  }
  .markdown-body h1, .markdown-body h2, .markdown-body h3 {
    font-weight: 600;
    margin-top: 32px;
    margin-bottom: 16px;
  }
  .markdown-body h1 {
    border-bottom: 1px solid #eaecef;
    padding-bottom: 0.3em;
  }
  .trademark {
    font-size: 0.8em;
    color: #6e7681;
    text-align: right;
    margin-top: 48px;
    padding-top: 16px;
    border-top: 1px solid #eaecef;
  }
</style>

<img src="/climate-docs/logo" alt="CraftedClimate Logo" style="display: block; margin: 20px auto; max-width: 300px;">

# CraftedClimate API Documentation

Welcome to the CraftedClimate API documentation. This API provides endpoints for:

- User Authentication & Management
- Device Telemetry Management
- Deployment Configuration
- Real-time Data Collection

## Key Features

- **Authentication**: Secure user registration and login with JWT tokens
- **Device Management**: Register and manage IoT devices with real-time updates
- **Telemetry**: Submit and retrieve device telemetry data with efficient caching
- **Deployments**: Organize devices into deployments with access control

## Security

This API implements multiple layers of security:

- **JWT Authentication**: Required for user-specific operations
- **API Key Authentication**: Required for device operations and telemetry submissions
- **Rate Limiting**: Prevents abuse of the API
- **Role-Based Access Control**: Restricts access based on user roles

## Getting Started

1. Register a new user account
2. Obtain your JWT token via login
3. Use the token in the Authorization header
4. For device operations, request an API key from support

## Real-time Data with WebSocket

Connect to real-time device telemetry using Socket.IO:

\`\`\`javascript
// Initialize Socket.IO client
const socket = io('https://your-api-endpoint', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Join a specific device's room
socket.emit('join', 'device-auid');

// Listen for real-time telemetry
socket.on('telemetry', (data) => {
  console.log('Received telemetry:', data);
});
\`\`\`

### WebSocket Events

| Event | Description |
|-------|-------------|
| \`join\` | Join a device's room using AUID |
| \`telemetry\` | Real-time telemetry updates |
| \`disconnect\` | Disconnection event |

For detailed examples and use cases, visit our [documentation](https://craftedclimate.com/docs).

<div class="trademark">© CraftedClimate 2025. All rights reserved.</div>
`,
      contact: {
        name: 'CraftedClimate Support',
        email: 'support@craftedclimate.com',
        url: 'https://craftedclimate.com/support'
      },
      license: {
        name: 'Proprietary',
        url: 'https://craftedclimate.com/terms'
      }
    },
    servers: [
      {
        url: isProd ? prodUrl : 'http://localhost:3000',
        description: isProd ? 'Production Server' : 'Development Server'
      }
    ],
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Error message'
            },
            error: {
              type: 'string',
              description: 'Detailed error information'
            }
          }
        },
        User: {
          type: 'object',
          properties: {
            userid: {
              type: 'string',
              description: 'Unique user identifier'
            },
            username: {
              type: 'string',
              description: 'User\'s username'
            },
            email: {
              type: 'string',
              description: 'User\'s email address'
            }
          }
        },
        Device: {
          type: 'object',
          properties: {
            devid: {
              type: 'string',
              description: 'Device identifier'
            },
            model: {
              type: 'string',
              description: 'Device model'
            },
            type: {
              type: 'string',
              description: 'Device type'
            }
          }
        },
        Deployment: {
          type: 'object',
          properties: {
            deploymentid: {
              type: 'string',
              description: 'Deployment identifier'
            },
            name: {
              type: 'string',
              description: 'Deployment name'
            },
            devices: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Device'
              }
            }
          }
        }
      },
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from login endpoint'
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-KEY',
          description: 'API key required for telemetry submissions and device operations'
        }
      }
    },
    security: [
      {
        bearerAuth: []
      },
      {
        apiKeyAuth: []
      }
    ],
    tags: [
      {
        name: 'Authentication',
        description: 'User registration, login, and session management'
      },
      {
        name: 'Telemetry',
        description: 'Device telemetry data submission and retrieval'
      },
      {
        name: 'Deployments',
        description: 'Deployment creation, configuration, and device management'
      }
    ],
  },
  apis: [
    './routes/user/**/*.js',
    './routes/devices/deployment/**/*.js',
    './routes/devices/user/**/*.js',
    './routes/devices/telemetry/**/*.js',
    './model/user/**/*.js',
    './model/deployment/**/*.js',
    './model/telemetry/**/*.js'
  ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
