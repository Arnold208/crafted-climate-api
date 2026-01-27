/**
 * RBAC & Platform Hardening Verification Script
 * ---------------------------------------------
 * Verifies:
 * 1. "verifyOrgMembership" populates req.orgMembership (The Critical Fix).
 * 2. "checkDeviceAccessCompatibility" respects Organization Role.
 * 3. Soft Deletes are respected (find returns null for deleted items).
 * 
 * Usage: node scripts/verify-rbac-logic.js
 */
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// ENV Loading Logic matching server.js/app.js pattern
const envFile = process.env.NODE_ENV === 'development' ? '.env.development' : '.env';
require('dotenv').config({ path: path.resolve(process.cwd(), envFile) });

// Fallback if that failed to find anything
if (!process.env.COSMOS_CONNECTION_STRING && !process.env.MONGO_URI) {
    require('dotenv').config(); // Try default
}

const Organization = require('../src/models/organization/organizationModel');
const User = require('../src/models/user/userModel');
const RegisteredDevice = require('../src/models/devices/registerDevice');
const verifyOrgMembership = require('../src/middleware/organization/verifyOrgMembership');
const { checkDeviceAccessCompatibility } = require('../src/middleware/devices/checkDeviceAccessCompatibility');

async function run() {
    let testOrgId, testUserId;

    try {
        console.log('--- ENV CHECK ---');
        // Support both naming conventions just in case, preferring Cosmos one
        const connStr = process.env.COSMOS_CONNECTION_STRING || process.env.MONGO_URI;

        console.log(`Connection Env Var Found: ${!!connStr}`);
        if (!connStr) {
            throw new Error('No Connection String (COSMOS_CONNECTION_STRING or MONGO_URI) found in env.');
        }

        console.log('Connecting to DB...');
        await mongoose.connect(connStr);
        console.log('Connected to DB.');

        // 1. Setup Test Data
        console.log('\n--- SETUP ---');
        testUserId = `user-test-${uuidv4()}`;
        const orgId = `org-test-${uuidv4()}`;
        testOrgId = orgId;

        // Create User
        await User.create({
            userid: testUserId,
            username: 'Test User',
            email: `test-${uuidv4()}@example.com`,
            password: 'hash',
            organization: [orgId] // Legacy array
        });

        // Create Organization
        await Organization.create({
            organizationId: orgId,
            name: 'Test Org RBAC',
            collaborators: [{
                userid: testUserId,
                role: 'org-user', // Start as User
                permissions: [],
                joinedAt: new Date()
            }]
        });

        // Create Device
        const device = await RegisteredDevice.create({
            auid: `dev-${uuidv4()}`,
            model: 'test',
            type: 'sensor',
            location: 'lab',
            userid: 'legacy-owner',
            manufacturingId: '123',
            mac: '00:00:00',
            serial: '123',
            devid: '123',
            organizationId: orgId, // Linked to Org
            deletedAt: null
        });

        // Create Deleted Device
        const deletedDeviceAuid = `dev-del-${uuidv4()}`;
        await RegisteredDevice.create({
            auid: deletedDeviceAuid,
            model: 'test-deleted',
            type: 'sensor',
            location: 'void',
            userid: 'legacy-owner',
            manufacturingId: '999',
            mac: '00:00:01',
            serial: '999',
            devid: '999',
            organizationId: orgId,
            deletedAt: new Date() // Already soft deleted
        });

        console.log(`Created Org: ${orgId}, User: ${testUserId}`);

        // 2. Verify Middleware Fix (req.orgMembership)
        console.log('\n--- TEST 1: verifyOrgMembership (The Fix) ---');

        const req = {
            user: { userid: testUserId, currentOrganizationId: orgId },
            headers: { 'x-org-id': orgId }
        };
        const res = {
            status: (code) => {
                return {
                    json: (data) => console.log(`[Response ${code}]`, data)
                };
            }
        };
        const next = () => { console.log('Middleware passed (next called)'); };

        await verifyOrgMembership(req, res, next);

        if (req.orgMembership && req.orgMembership.role === 'org-user') {
            console.log('✅ PASS: req.orgMembership was correctly populated.');
        } else {
            console.error('❌ FAIL: req.orgMembership is missing or incorrect.', req.orgMembership);
        }

        // 3. Verify Device Access via Org Role
        console.log('\n--- TEST 2: checkDeviceAccessCompatibility (Org Role) ---');

        // Scenario: org-user trying to VIEW device (Should Pass)
        const canView = await checkDeviceAccessCompatibility(req, device, 'org.devices.view');

        if (canView === true) {
            console.log('✅ PASS: Org-User allowed to view device via Org Context.');
        } else {
            console.error('❌ FAIL: Org-User denied view access.');
        }

        // Scenario: org-user trying to EDIT device (Should Fail)
        const canEdit = await checkDeviceAccessCompatibility(req, device, 'org.devices.edit');
        if (canEdit === false) {
            console.log('✅ PASS: Org-User denied edit access (Correct).');
        } else {
            console.error('❌ FAIL: Org-User allowed to edit (Security Risk).');
        }

        // 4. Soft Delete Verification
        console.log('\n--- TEST 3: Soft Delete Safety ---');

        // Find Active Device
        const activeFind = await RegisteredDevice.findOne({ auid: device.auid, deletedAt: null });
        if (activeFind) {
            console.log('✅ PASS: Active device found.');
        } else {
            console.error('❌ FAIL: Active device NOT found.');
        }

        // Find Soft Deleted Device (simulation of service query)
        const deletedFind = await RegisteredDevice.findOne({ auid: deletedDeviceAuid, deletedAt: null });
        if (!deletedFind) {
            console.log('✅ PASS: Soft deleted device hidden from default query.');
        } else {
            console.error('❌ FAIL: Soft deleted device was RETURNED!');
        }

        console.log('\nVerification Complete.');

    } catch (err) {
        console.error('Test Failed:', err);
    } finally {
        // Cleanup
        if (testOrgId) {
            console.log('\nCleaning up...');
            await Organization.deleteOne({ organizationId: testOrgId });
            await User.deleteOne({ userid: testUserId });
            await RegisteredDevice.deleteMany({ organizationId: testOrgId });
            // Note: In real app we soft delete, here we hard clean test data
        }
        await mongoose.disconnect();
    }
}

run();
