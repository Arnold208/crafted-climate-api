// migrate-mongo-config.js
require('dotenv').config();

const config = {
    mongodb: {
        // We use the same connection string as the app
        url: process.env.COSMOS_CONNECTION_STRING || "mongodb://localhost:27017",

        databaseName: process.env.DATABASE_NAME || "crafted_climate_db",

        options: {
            // proper connection options for CosmosDB or standard Mongo
            // useNewUrlParser: true, // simplified in newer drivers
            // useUnifiedTopology: true,
            // connectTimeoutMS: 3600000,
            // socketTimeoutMS: 3600000,
        }
    },

    // The migrations dir, can be an relative or absolute path. Only edit this when really necessary.
    migrationsDir: "db-migrations",

    // The mongodb collection where the applied changes are stored. Only edit this when really necessary.
    changelogCollectionName: "changelog",

    // The file extension to create migrations and search for in migration dir 
    migrationFileExtension: ".js",

    // Enable the algorithm to create a checksum of the file contents and use that in the comparison to determine
    // if the file should be run.  Requires that scripts are coded to be run multiple times.
    useFileHash: false,

    // Don't change this, unless you know what you are doing
    moduleSystem: 'commonjs',
};

module.exports = config;
