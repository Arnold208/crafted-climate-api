# CraftedClimate API Documentation

Welcome to CraftedClimate's API documentation. This repository contains comprehensive documentation for interacting with CraftedClimate's APIs for device telemetry, user management, and deployment control.

## Quick Links

- [User Quickstart Guide](user/quickstart.md) - Get started in 5 minutes
- [Developer Reference](dev/reference.md) - Complete API reference
- [API Documentation UI](api.html) - Interactive API documentation
- [Postman Collection](postman/CraftedClimate.postman_collection.json) - Ready-to-use API collection

## Overview

CraftedClimate provides APIs for:

- **User & Authentication**: User registration, login, and API key management
- **Telemetry & Devices**: Submit and retrieve device telemetry data, device registration and control
- **Deployments**: Manage device deployments and their metadata

## Getting Started

1. [Install Requirements](#requirements)
2. [Get API Access](#api-access)
3. [Run Examples](#running-examples)

### Requirements

- Node.js >= 18
- Python 3.9+ (optional, for Python examples)
- NPM or Yarn

### API Access

For development and testing:
```bash
# Install documentation dependencies
cd docs
npm install

# Start the mock server
npm run docs:mock
```

The mock server will run on http://localhost:4010

### Running Examples

```bash
# Run the Node.js example
node examples/sendTelemetry.js

# Run the Python example (if Python is installed)
python3 examples/sendTelemetry.py
```

## Documentation Structure

- `docs/user/` - End user documentation
- `docs/dev/` - Developer documentation
- `docs/examples/` - Code examples
- `docs/postman/` - Postman collection
- `docs/mock/` - Mock server configuration
- `openapi.yaml` - OpenAPI specification

## Support

For questions or issues:

- Open an issue in this repository
- Contact support@craftedclimate.com
- Visit our [support portal](https://support.craftedclimate.com)

## License

Copyright © 2025 CraftedClimate. All rights reserved.