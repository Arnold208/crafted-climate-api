// config/database/mongodb.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

let envFile;

if (process.env.NODE_ENV === 'development') {
  envFile = '.env.development';
} else {
  envFile = '.env';   // default for production or if NODE_ENV not set
}

dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });

const dbName = process.env.DATABASE_NAME;
const connectionString = process.env.COSMOS_CONNECTION_STRING;

const connectDB = async () => {
  try {
    await mongoose.connect(connectionString, {
      dbName,
      // 🚀 PRODUCTION SCALING: Connection pooling
      maxPoolSize: 100,           // Handle up to 100 concurrent ops per instance
      minPoolSize: 10,            // Keep 10 connections warm
      socketTimeoutMS: 45000,     // Close sockets after 45s of inactivity
      serverSelectionTimeoutMS: 5000, // Fail fast if DB is down
      heartbeatFrequencyMS: 10000,
      retryWrites: true           // Critical for CosmosDB consistency
    });

    console.log(`✅ Connected to MongoDB: ${dbName} (Pool: 10-100)`);
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
