module.exports = {
    async up(db, client) {
        console.log("Creating baseline indexes...");

        // --- Users ---
        await db.collection('users').createIndex({ userid: 1 }, { unique: true });
        await db.collection('users').createIndex({ email: 1 }, { unique: true });

        // --- Sensor Models ---
        await db.collection('sensor_models').createIndex({ uuid: 1 }, { unique: true });
        await db.collection('sensor_models').createIndex({ model: 1 }, { unique: true });

        // --- Registered Devices (inferred collection name 'devices') ---
        // Note: registerDevice.js likely uses 'devices' or 'registered_devices' collection. Assuming 'devices' from context behavior.
        // If collection doesn't exist, Mongo creates it on index creation.
        await db.collection('devices').createIndex({ devid: 1 }, { unique: true });
        await db.collection('devices').createIndex({ auid: 1 }, { unique: true });
        await db.collection('devices').createIndex({ userid: 1 }, { unique: false }); // For listing user devices

        // --- Telemetry (Env) ---
        // Important for filtered queries and sorting
        await db.collection('env_telemetries').createIndex({ auid: 1, transport_time: -1 });
        await db.collection('env_telemetries').createIndex({ transport_time: -1 });

        // --- Organizations ---
        await db.collection('organizations').createIndex({ organizationId: 1 }, { unique: true });

        console.log("Baseline indexes created.");
    },

    async down(db, client) {
        console.log("Dropping baseline indexes... (Are you sure this is wise?)");

        try {
            await db.collection('users').dropIndex('userid_1');
            await db.collection('users').dropIndex('email_1');

            await db.collection('sensor_models').dropIndex('uuid_1');
            await db.collection('sensor_models').dropIndex('model_1');

            await db.collection('devices').dropIndex('devid_1');
            await db.collection('devices').dropIndex('auid_1');
            await db.collection('devices').dropIndex('userid_1');

            await db.collection('env_telemetries').dropIndex('auid_1_transport_time_-1');
            await db.collection('env_telemetries').dropIndex('transport_time_-1');

            await db.collection('organizations').dropIndex('organizationId_1');

        } catch (e) {
            console.warn("Error dropping indexes (maybe they didn't exist):", e.message);
        }
    }
};
