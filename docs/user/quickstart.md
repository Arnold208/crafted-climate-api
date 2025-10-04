# CraftedClimate Quickstart Guide

Welcome! This guide will help you get started with CraftedClimate in just 5 minutes. We'll cover how to:
1. Get your API key
2. Register a device
3. Send your first telemetry data
4. View the results

## 1. Get Your API Key

1. Register for a CraftedClimate account:
   ```bash
   curl -X POST http://localhost:4010/api/auth/signup \
     -F "username=yourname" \
     -F "email=you@example.com" \
     -F "password=yourpassword" \
     -F "contact=233555123456"
   ```

   You'll receive a response with your user ID and a temporary API key.

2. **IMPORTANT**: Save your API key safely! You'll need it for all future requests.

   Example API key format: `cc_live_xxxxxxxxxxxxxx`

## 2. Send Your First Telemetry Data

Let's send some environmental data from your device:

```bash
curl -X POST http://localhost:4010/api/telemetry/env \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "i": "your-device-id",
    "t": 25.4,
    "h": 65,
    "p": 1013.25
  }'
```

This sends:
- Temperature: 25.4°C
- Humidity: 65%
- Pressure: 1013.25 hPa

## 3. Create a Deployment

Group your devices into a deployment:

```bash
curl -X POST http://localhost:4010/api/devices/create-deployments \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userid": "your-user-id",
    "name": "My First Deployment",
    "description": "Monitoring my home environment"
  }'
```

## What's Next?

- Visit our [Developer Reference](../dev/reference.md) for complete API details
- Check out example scripts in Python and Node.js in the `examples/` directory
- Join our [community forum](https://community.craftedclimate.com) for support

## Need Help?

- Email: support@craftedclimate.com
- Support hours: 24/7
- Emergency support: +1-555-0123 (Premium users only)

Remember: This guide uses our mock server for testing. Replace `http://localhost:4010` with `https://api.craftedclimate.com` for production use.