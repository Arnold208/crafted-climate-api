// const dotenv = require('dotenv');
// const path = require('path');

// let envFile;

// if (process.env.NODE_ENV === 'development') {
//   envFile = '.env.development';
// } else {
//   envFile = '.env.development';   // default for production or if NODE_ENV not set
// }

// dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });

const mongoose = require('mongoose');
const connectDB = require('../config/database/mongodb');

// 2. Import BOTH models
const addDevice = require('../model/devices/addDevice');
const registerNewDevice = require('../model/devices/registerDevice');

/**
 * The main migration function.
 * This script copies the 'noteDevUuid' from 'addDevice' to 'registeredDev'
 * using 'serial' as the matching key.
 */
const runMigration = async () => {
  try {
    console.log('Loading source UUIDs from "addDevice" collection...');

    // 3. Get all 'addDevice' docs and put them in a Map for fast lookups
    const addDeviceMap = new Map();
    const allAddDevices = await addDevice.find({}, 'serial noteDevUuid');

    for (const dev of allAddDevices) {
      if (dev.serial && dev.noteDevUuid) {
        addDeviceMap.set(dev.serial, dev.noteDevUuid);
      }
    }
    console.log(`Loaded ${addDeviceMap.size} source devices into memory.`);

    // 4. Find all 'registeredDev' docs that need to be updated
    const documentsToUpdate = await registerNewDevice.find({
      noteDevUuid: { $exists: false }
    });

    if (documentsToUpdate.length === 0) {
      console.log('✅ No registered devices found to migrate. All set!');
      return;
    }

    console.log(`🔎 Found ${documentsToUpdate.length} registered devices to update...`);

    // 5. Create the bulk update operations
    const operations = [];
    let unmappedCount = 0;

    for (const doc of documentsToUpdate) {
      const sourceUuid = addDeviceMap.get(doc.serial);

      if (sourceUuid) {
        operations.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: { noteDevUuid: sourceUuid } }
          }
        });
      } else {
        console.warn(`⚠️ Warning: No source UUID found for registered device with serial: ${doc.serial}`);
        unmappedCount++;
      }
    }

    if (operations.length === 0) {
      console.log('No matching devices were found to update.');
      return;
    }

    // 6. Execute all operations
    const result = await registerNewDevice.bulkWrite(operations);

    console.log('🎉 Migration complete!');
    console.log(`Successfully modified: ${result.modifiedCount} documents.`);
    if (unmappedCount > 0) {
      console.log(`Could not find a match for ${unmappedCount} documents.`);
    }

  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from database.');
  }
};

// --- NEW Updated Connection Handling ---
(async () => {
  try {
    await connectDB();  // connect first

    console.log('🚀 Database connection open. Starting migration...');
    await runMigration();

  } catch (err) {
    console.error('❌ Migration script failed to connect:', err);
    process.exit(1);
  }
})();
