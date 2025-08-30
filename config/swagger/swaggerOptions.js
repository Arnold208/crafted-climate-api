const swaggerJsdoc = require('swagger-jsdoc');

const isProd = process.env.NODE_ENV === 'production';
const prodUrl = process.env.PROD_URL;

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Crafted Climate API',
      version: '1.0.0',
      description: isProd
        ? 'Crafted Climate Production API Docs'
        : 'Crafted Climate Development API Docs',
    },
    servers: [
      {
        url: isProd
          ? prodUrl
          : 'http://localhost:3000',
        description: isProd ? 'Production Server' : 'Development Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-KEY',
          description: 'Admin API key required for privileged endpoints',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
      {
        apiKeyAuth: [],
      },
    ],
  },
  apis: ['./routes/**/*.js', './models/**/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
