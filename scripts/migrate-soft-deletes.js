const Organization = require('../src/models/organization/organizationModel');
const User = require('../src/models/user/userModel');
const RegisteredDevice = require('../src/models/devices/registerDevice');
const Deployment = require('../src/models/deployment/deploymentModel');

/**
 * MIGRATION: Platform Hardening - Add Soft Deletes (deletedAt)
 * 
 * Safe, additive migration.
 * Logic:
 * 1. Find documents where `deletedAt` is missing.
 * 2. Set `deletedAt` to null.
 * 
 * Usage:
 * node scripts/migrate-soft-deletes.js
 */
const mongoose = require('mongoose');
require('dotenv').config(); // Load .env

async function run() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        console.log('--- Migrating Organizations ---');
        const orgRes = await Organization.updateMany(
            { deletedAt: { $exists: false } },
            { $set: { deletedAt: null, settings: {} } }
        );
        console.log(`Updated ${orgRes.modifiedCount} organizations.`);

        console.log('--- Migrating Users ---');
        const userRes = await User.updateMany(
            { deletedAt: { $exists: false } },
            { $set: { deletedAt: null } }
        );
        console.log(`Updated ${userRes.modifiedCount} users.`);

        console.log('--- Migrating Devices ---');
        const devRes = await RegisteredDevice.updateMany(
            { deletedAt: { $exists: false } },
            { $set: { deletedAt: null, hardwareVersion: null, firmwareVersion: null, capabilities: [] } }
        );
        console.log(`Updated ${devRes.modifiedCount} devices.`);

        console.log('--- Migrating Deployments ---');
        const depRes = await Deployment.updateMany(
            { deletedAt: { $exists: false } },
            { $set: { deletedAt: null } }
        );
        console.log(`Updated ${depRes.modifiedCount} deployments.`);

        console.log('Migration Complete.');
        process.exit(0);

    } catch (err) {
        console.error('Migration Failed:', err);
        process.exit(1);
    }
}

run();
