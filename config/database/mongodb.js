// config/database/mongodb.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load correct .env file based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });

const dbName = process.env.DATABASE_NAME;
const connectionString = process.env.COSMOS_CONNECTION_STRING;

const connectDB = async () => {
  try {
    await mongoose.connect(connectionString, {
      dbName,
    });

    console.log(`Connected to MongoDB: ${dbName}`);
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
