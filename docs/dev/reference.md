# CraftedClimate Developer Reference

This guide provides detailed technical information about CraftedClimate's API endpoints, authentication methods, and how to run the API mock server locally.

## Table of Contents

1. [Authentication](#authentication)
2. [API Endpoints](#api-endpoints)
3. [Running the Mock Server](#running-the-mock-server)
4. [Source Code References](#source-code-references)

## Authentication

CraftedClimate uses two authentication methods:

### API Key Authentication
Used for device telemetry submissions:
```http
X-API-Key: cc_live_xxxxxxxxxxxxxx
```

Source: [apiKeymiddleware.js](../../middleware/apiKeymiddleware.js)

### Bearer Token Authentication
Used for user operations and deployments:
```http
Authorization: Bearer <jwt_token>
```

Source: [bearermiddleware.js](../../middleware/bearermiddleware.js)

## API Endpoints

### User & Authentication

#### Register New User
```http
POST /api/auth/signup
Content-Type: multipart/form-data
```

Required fields:
- `username`: User's display name
- `email`: Valid email address
- `password`: Secure password
- `contact`: Phone number in international format

Optional:
- `profilePicture`: User's profile image

Source: [user.js](../../routes/user/user.js)

### Telemetry & Devices

#### Submit Telemetry
```http
POST /api/telemetry/{model}
Content-Type: application/json
X-API-Key: YOUR_API_KEY
```

Parameters:
- `model`: Device model type (env, gas, terra)

Required fields:
- `i`: Device ID

Optional fields based on model type:
- `t`: Temperature
- `h`: Humidity
- `p`: Pressure

Source: [telemetry.js](../../routes/devices/telemetry/telemetry.js)

### Deployments

#### Create Deployment
```http
POST /api/devices/create-deployments
Content-Type: application/json
Authorization: Bearer YOUR_ACCESS_TOKEN
```

Required fields:
- `userid`: User ID
- `name`: Deployment name

Optional:
- `description`: Deployment description

Source: [deployment.js](../../routes/devices/deployment/deployment.js)

## Running the Mock Server

1. Install dependencies:
   ```bash
   cd docs
   npm install
   ```

2. Start the mock server:
   ```bash
   npm run docs:mock
   ```

The mock server runs on http://localhost:4010

### Mock Server Features

- Simulated responses for all API endpoints
- No actual data persistence
- CORS enabled for local development
- Request validation against OpenAPI spec

## Source Code References

All routes are implemented in these locations:

- User routes: [routes/user/user.js](../../routes/user/user.js)
- Telemetry routes: [routes/devices/telemetry/telemetry.js](../../routes/devices/telemetry/telemetry.js)
- MQTT handling: [routes/telemetry/mqtt_secure_msg.js](../../routes/telemetry/mqtt_secure_msg.js)
- Deployment routes: [routes/devices/deployment/deployment.js](../../routes/devices/deployment/deployment.js)

## Response Formats

All API responses follow this structure:

Success:
```json
{
  "status": "success",
  "data": {
    // Response data
  }
}
```

Error:
```json
{
  "status": "error",
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

## Rate Limits

- Authentication endpoints: 5 requests per minute
- Telemetry submissions: 60 requests per minute per device
- Other endpoints: 30 requests per minute

Source: [rateLimiter.js](../../middleware/rateLimiter.js)

## Need Help?

- Technical Support: devs@craftedclimate.com
- API Status: https://status.craftedclimate.com
- Developer Forum: https://community.craftedclimate.com/developers