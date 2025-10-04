# Using CraftedClimate API Documentation

This guide provides step-by-step instructions for running and using the CraftedClimate API documentation locally.

## Prerequisites

1. Verify Node.js installation (required):
   ```bash
   node --version  # Should be >= 18
   ```

2. Verify Python installation (optional, for Python examples):
   ```bash
   python3 --version  # Should be >= 3.9
   ```

## Installation

1. Navigate to the docs directory:
   ```bash
   cd docs
   ```

2. Install dependencies:
   ```bash
   npm run docs:install
   ```

## Validation

1. Validate the OpenAPI specification:
   ```bash
   npm run docs:validate
   ```

## Running the Documentation

1. Start the mock server:
   ```bash
   npm run docs:mock
   ```
   The mock server will be available at http://localhost:4010

2. In a new terminal, start the documentation server:
   ```bash
   npm run docs:start
   ```
   Open http://localhost:8080/api.html in your browser

## Running Examples

### Node.js Example
```bash
node examples/sendTelemetry.js
```

### Python Example
```bash
python3 examples/sendTelemetry.py
```

### Curl Examples

1. Register a user:
```bash
curl -X POST http://localhost:4010/api/auth/signup \
  -F "username=testuser" \
  -F "email=test@example.com" \
  -F "password=securepass123" \
  -F "contact=233555123456"
```

2. Submit telemetry:
```bash
curl -X POST http://localhost:4010/api/telemetry/env \
  -H "X-API-Key: cc_test_123456789" \
  -H "Content-Type: application/json" \
  -d '{
    "i": "device123",
    "t": 25.4,
    "h": 65,
    "p": 1013.25
  }'
```

3. Create deployment:
```bash
curl -X POST http://localhost:4010/api/devices/create-deployments \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0MTIzIn0.mock" \
  -H "Content-Type: application/json" \
  -d '{
    "userid": "user123",
    "name": "Test Deployment",
    "description": "Test deployment"
  }'
```

## Using Postman

1. Import the collection:
   - Open Postman
   - Click "Import" > "File" > Select `postman/CraftedClimate.postman_collection.json`

2. Set environment variables:
   - Create a new environment
   - Set `baseUrl` to `http://localhost:4010`
   - Set `apiKey` to `cc_test_123456789`
   - Set `accessToken` to the mock JWT token

## Troubleshooting

1. If the mock server fails to start:
   - Check if port 4010 is already in use
   - Try killing any existing processes: `npx kill-port 4010`

2. If documentation fails to load:
   - Verify that openapi.yaml is valid: `npm run docs:validate`
   - Check browser console for errors
   - Try clearing browser cache

For more help, check the [Developer Reference](dev/reference.md) or contact support@craftedclimate.com.