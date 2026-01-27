/**
 * ----------------------------------------------------------
 * Crafted Climate — Legacy Device Migration
 * ----------------------------------------------------------
 * This script fixes missing device ownership/org/deployment
 * for OLD devices that existed before RBAC.
 *
 * WHAT IT DOES:
 * 1. Ensures each user has a personal organization
 * 2. Creates a default deployment for each org
 * 3. Assigns legacy devices to the owner's personal org
 * 4. Fills missing fields: ownerUserId, organizationId,
 *    deploymentId
 *
 * WHAT IT DOES NOT DO:
 * ❌ remove legacy data
 * ❌ touch collaborators
 * ❌ overwrite correct values
 * ----------------------------------------------------------
 */

const connectDB = require('../config/database/mongodb');
const User = require('../model/user/userModel');
const Organization = require('../model/organization/organizationModel');
const Deployment = require('../model/deployment/deploymentModel');
const Device = require('../model/devices/registerDevice');
const { v4: uuidv4 } = require('uuid');

(async () => {
  try {
    console.log("Connecting to MongoDB...");
    await connectDB();
    console.log("✔ Connected.");

    const devices = await Device.find();
    console.log(`Found ${devices.length} devices to check.`);

    for (const device of devices) {
      const userId = device.userid;
      if (!userId) {
        console.log(`⚠ Device ${device.auid} has no userid field. Skipping.`);
        continue;
      }

      const user = await User.findOne({ userid: userId });
      if (!user) {
        console.log(`⚠ Device owner ${userId} not found. Skipping.`);
        continue;
      }

      // --------------------------------------------
      // 1. Ensure personal organization exists
      // --------------------------------------------
      let orgId = user.personalOrganizationId;

      if (!orgId) {
        orgId = `org-${uuidv4()}`;

        const personalOrg = await Organization.create({
          organizationId: orgId,
          name: `${user.username} Personal`,
          description: "Auto-generated personal organization",
          planType: "personal",
          createdBy: user.userid,
          collaborators: [
            {
              userid: user.userid,
              role: "org-admin",
              permissions: []
            }
          ]
        });

        console.log(`✔ Created personal org for user ${user.userid}: ${orgId}`);

        user.personalOrganizationId = orgId;
        user.currentOrganizationId = orgId;
        await user.save();
      }

      // --------------------------------------------
      // 2. Ensure default deployment exists
      // --------------------------------------------
      const existingDeployments = await Deployment.find({ organizationId: orgId });

      let defaultDeployment;
      if (existingDeployments.length === 0) {
        const depId = `dep-${uuidv4()}`;
        defaultDeployment = await Deployment.create({
          deploymentid: depId,      // ← lowercase 'id' - schema requires this
          userid: userId,           // ← schema requires this (owner of deployment)
          organizationId: orgId,
          name: "Default Deployment",
          description: "Auto-generated",
          devices: []
        });

        console.log(`✔ Created default deployment: ${defaultDeployment.deploymentid}`);
      } else {
        defaultDeployment = existingDeployments[0];
      }

      // --------------------------------------------
      // 3. Fix legacy device fields
      // --------------------------------------------
      let changed = false;

      if (!device.ownerUserId) {
        device.ownerUserId = userId;
        changed = true;
      }

      if (!device.organizationId) {
        device.organizationId = orgId;
        changed = true;
      }

      if (!device.deploymentId) {
        device.deploymentId = defaultDeployment.deploymentid; // ← use deploymentid from model
        changed = true;
      }

      // 4. Fix invalid collaborator roles
      // Map old role names to new enum values
      // Valid roles: ["device-admin", "device-support", "device-user"]
      // Old roles might be: "admin", "editor", "viewer", "owner", etc.
      // --------------------------------------------
      const roleMapping = {
        "admin": "device-admin",
        "editor": "device-support",
        "viewer": "device-user",
        "owner": "device-admin",
        "support": "device-support",
        "user": "device-user"
      };

      if (device.collaborators && device.collaborators.length > 0) {
        for (const collab of device.collaborators) {
          if (!["device-admin", "device-support", "device-user"].includes(collab.role)) {
            const newRole = roleMapping[collab.role] || "device-user"; // default to viewer role
            console.log(`  ⚠ Fixed invalid role '${collab.role}' → '${newRole}' for collaborator ${collab.userid}`);
            collab.role = newRole;
            changed = true;
          }
        }
      }

      if (changed) {
        await device.save();
        console.log(`✔ Updated device ${device.auid}`);
      }
    }

    console.log("--------------------------------------");
    console.log("✔ Legacy device migration completed.");
    console.log("--------------------------------------");
    process.exit(0);

  } catch (err) {
    console.error("❌ Migration Error:", err);
    process.exit(1);
  }
})();
