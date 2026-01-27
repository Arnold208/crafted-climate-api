const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { nanoid } = require('nanoid');

const User = require('../../model/user/userModel');
const Organization = require('../../model/organization/organizationModel');
const UserSubscription = require('../../model/subscriptions/UserSubscription');
const Plan = require('../../model/subscriptions/Plan');

const authenticateToken = require('../../middleware/bearermiddleware');
const checkOrgAccess = require('../../middleware/organization/checkOrgAccess');
const authorizeRoles = require('../../middleware/rbacMiddleware');


/**
 * @swagger
 * tags:
 *   name: Organizations
 *   description: Manage organizations, collaborators, and RBAC roles
 */



/**
 * @swagger
 * /api/org/create:
 *   post:
 *     summary: Create a new organization (Platform Admin only)
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     description: >
 *       Platform admin creates a new enterprise organization.\
 *       Automatically assigns the owner as **org-admin**.\
 *       Organization also receives a subscription entry.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - ownerUserId
 *             properties:
 *               name:
 *                 type: string
 *                 example: Accra Climate Lab
 *               description:
 *                 type: string
 *                 example: Research and monitoring organization
 *               ownerUserId:
 *                 type: string
 *                 example: usr_9f2h29f2
 *               planName:
 *                 type: string
 *                 example: enterprise
 *     responses:
 *       201:
 *         description: Organization created successfully
 *       400:
 *         description: Missing required fields
 *       404:
 *         description: Owner user not found
 *       500:
 *         description: Server error
 */
// routes/organization/createOrganization.js

router.post('/create', authenticateToken, authorizeRoles('admin'), async (req, res) => {
    try {
        const { name, description, ownerUserId, planName } = req.body;

        if (!name || !ownerUserId) {
            return res.status(400).json({ message: "Missing required fields: name, ownerUserId" });
        }

        // STEP 0 — Ensure organization name is unique (case-insensitive)
        const existingOrg = await Organization.findOne({
            name: new RegExp(`^${name}$`, "i")
        });

        if (existingOrg) {
            return res.status(409).json({
                message: "Organization name already exists. Please choose a different name."
            });
        }

        // STEP 1 — Ensure owner exists
        const owner = await User.findOne({ userid: ownerUserId });
        if (!owner) {
            return res.status(404).json({ message: "Owner user not found" });
        }

        // STEP 2 — Build org
        const organizationId = `org-${uuidv4()}`;

        const org = new Organization({
            organizationId,
            name,
            description,
            collaborators: [
                {
                    userid: ownerUserId,
                    role: "org-admin",
                    permissions: []
                }
            ],
            planType: "enterprise",
            createdBy: req.user.userid
        });

        const savedOrg = await org.save();
        console.log("✔ Organization saved:", savedOrg.organizationId);

        // STEP 3 — Add org to owner (safe set)
        await User.updateOne(
            { userid: ownerUserId },
            { $addToSet: { organization: organizationId } }
        );

        // STEP 4 — Load subscription plan
        const plan = await Plan.findOne({
            name: planName || "enterprise",
            isActive: true
        });

        if (plan) {
            // 4A — Create subscription document
            await UserSubscription.create({
                subscriptionId: uuidv4(),
                userid: ownerUserId,
                organizationId,
                subscriptionScope: "organization",
                planId: plan.planId,
                billingCycle: "monthly",
                status: "active"
            });

            // 4B — Update organization.subscription.planId
            await Organization.updateOne(
                { organizationId },
                {
                    $set: {
                        "subscription.planId": plan.planId,
                        "subscription.status": "active",
                        "subscription.subscribedAt": new Date()
                    }
                }
            );

            console.log(`✔ Organization subscription assigned: ${plan.planId}`);
        } else {
            console.log("⚠ No active plan found — skipping subscription assignment");
        }

        return res.status(201).json({
            message: "Organization created successfully",
            organizationId
        });

    } catch (error) {
        console.error("❌ Organization creation error:", error);
        return res.status(500).json({
            message: "Error creating organization",
            error: error.message
        });
    }
});




/**
 * @swagger
 * /api/org/{orgId}/add-user:
 *   post:
 *     summary: Add a user to an organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     description: >
 *       Adds a user to an organization with the specified role.\
 *       Requires `org.users.invite` permission.
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@domain.com
 *               role:
 *                 type: string
 *                 enum: [org-admin, org-support, org-user]
 *                 example: org-user
 *     responses:
 *       200:
 *         description: User added to organization
 *       400:
 *         description: User already exists in organization
 *       404:
 *         description: User or organization not found
 *       500:
 *         description: Internal server error
 */
router.post('/:orgId/add-user',
    authenticateToken,
    checkOrgAccess("org.users.invite"),
    async (req, res) => {
        try {
            const { orgId } = req.params;
            const { email, role } = req.body;

            const user = await User.findOne({ email });
            if (!user) return res.status(404).send({ message: "User not found" });

            const org = await Organization.findOne({ organizationId: orgId });
            if (!org) return res.status(404).send({ message: "Organization not found" });

            const exists = org.collaborators.some(c => c.userid === user.userid);
            if (exists) {
                return res.status(400).send({ message: "User already belongs to organization" });
            }

            org.collaborators.push({
                userid: user.userid,
                role,
                permissions: []
            });

            await org.save();

            user.organization.push(orgId);
            await user.save();

            return res.status(200).send({
                message: "User added to organization",
                userid: user.userid
            });

        } catch (error) {
            return res.status(500).send({ message: "Error adding user", error: error.message });
        }
    }
);



/**
 * @swagger
 * /api/org/{orgId}/update-user-role:
 *   patch:
 *     summary: Update user role in organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     description: >
 *       Update the RBAC role of a user inside an organization.\
 *       Requires `org.users.change-role` permission.
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userid
 *               - newRole
 *             properties:
 *               userid:
 *                 type: string
 *                 example: usr_92kk2k2
 *               newRole:
 *                 type: string
 *                 enum: [org-admin, org-support, org-user]
 *                 example: org-support
 *     responses:
 *       200:
 *         description: User role updated successfully
 *       404:
 *         description: Organization or user not found
 *       500:
 *         description: Error updating role
 */
router.patch('/:orgId/update-user-role',
    authenticateToken,
    checkOrgAccess("org.users.change-role"),
    async (req, res) => {
        try {
            const { orgId } = req.params;
            const { userid, newRole } = req.body;

            const org = await Organization.findOne({ organizationId: orgId });
            if (!org) return res.status(404).send({ message: "Organization not found" });

            const member = org.collaborators.find(c => c.userid === userid);
            if (!member) {
                return res.status(404).send({ message: "User not in organization" });
            }

            member.role = newRole;
            await org.save();
            console.log(org)

            return res.status(200).send({ message: "User role updated successfully" });

        } catch (error) {
            return res.status(500).send({ message: "Error updating role", error: error.message });
        }
    }
);



/**
 * @swagger
 * /api/org/{orgId}/remove-user/{userid}:
 *   delete:
 *     summary: Remove a user from an organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     description: >
 *       Removes a user from the collaborators list of an organization.\
 *       Requires `org.users.remove` permission.
 *     parameters:
 *       - name: orgId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: userid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User removed
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Server error
 */
router.delete('/:orgId/remove-user/:userid',
    authenticateToken,
    checkOrgAccess("org.users.remove"),
    async (req, res) => {
        try {
            const { orgId, userid } = req.params;

            const org = await Organization.findOne({ organizationId: orgId });
            if (!org) return res.status(404).send({ message: "Organization not found" });

            // 1. Remove from organization collaborators
            org.collaborators = org.collaborators.filter(c => c.userid !== userid);
            await org.save();

            // 2. Remove organization from user's organization array
            await User.updateOne(
                { userid },
                { $pull: { organization: orgId } }
            );

            // 🔗 REFERENTIAL INTEGRITY: Clean up deployments and collaborators
            
            // 3. Get all deployments in this organization
            const Deployment = require('../../model/deployment/deploymentModel');
            const deployments = await Deployment.find({ organizationId: orgId });
            const deploymentIds = deployments.map(d => d.deploymentid);

            // 4. Remove userid from all deployment collaborators in this org
            await Deployment.updateMany(
                { organizationId: orgId },
                { $pull: { collaborators: { userid } } }
            );

            // 5. Remove organization's deployments from user's deployments array
            await User.updateOne(
                { userid },
                { $pullAll: { deployments: deploymentIds } }
            );

            // 6. Get all devices in this organization
            const RegisteredDevice = require('../../model/devices/registerDevice');
            const devices = await RegisteredDevice.find({ organizationId: orgId });

            // 7. Remove userid from all device collaborators in this org
            await RegisteredDevice.updateMany(
                { organizationId: orgId },
                { $pull: { collaborators: { userid } } }
            );

            return res.status(200).send({ message: "User removed from organization with full referential cleanup" });

        } catch (error) {
            return res.status(500).send({ message: "Error removing user", error: error.message });
        }
    }
);



/**
 * @swagger
 * /api/org/select:
 *   patch:
 *     summary: Switch active organization for the logged-in user
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     description: >
 *       Allows a user who belongs to multiple organizations to select which one is active for API access.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - organizationId
 *             properties:
 *               organizationId:
 *                 type: string
 *                 example: org-c8392kkc
 *     responses:
 *       200:
 *         description: Active organization switched
 *       403:
 *         description: User does not belong to organization
 *       500:
 *         description: Server error
 */
router.patch('/select', authenticateToken, async (req, res) => {
    try {
        const { organizationId } = req.body;

        const user = await User.findOne({ userid: req.user.userid });

        if (!user.organization.includes(organizationId)) {
            return res.status(403).send({ message: "You do not belong to that organization" });
        }

        user.currentOrganizationId = organizationId;
        await user.save();

        return res.status(200).send({
            message: "Active organization switched",
            currentOrganizationId: organizationId
        });

    } catch (error) {
        return res.status(500).send({ message: "Error switching organization", error: error.message });
    }
});



/**
 * @swagger
 * /api/org/my-organizations:
 *   get:
 *     summary: Get all organizations the user belongs to
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user organizations
 *       500:
 *         description: Error fetching data
 */
router.get('/my-organizations', authenticateToken, async (req, res) => {
    try {
        const user = await User.findOne({ userid: req.user.userid });

        const orgs = await Organization.find({
            organizationId: { $in: user.organization }
        });

        return res.status(200).send(orgs);

    } catch (error) {
        return res.status(500).send({ message: "Error fetching organizations", error: error.message });
    }
});


/**
 * @swagger
 * /api/org/{orgId}/info:
 *   get:
 *     summary: Get full organization details
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *     responses:
 *       200:
 *         description: Organization details returned successfully
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Server error
 */
router.get('/:orgId/info', authenticateToken, async (req, res) => {
    try {
        const { orgId } = req.params;

        const org = await Organization.findOne({ organizationId: orgId });

        if (!org) {
            return res.status(404).send({ message: "Organization not found" });
        }

        return res.status(200).send(org);

    } catch (error) {
        return res.status(500).send({ message: "Error fetching organization details", error: error.message });
    }
});

/**
 * @swagger
 * /api/org/create:
 *   post:
 *     tags: [Organizations]
 *     summary: Create a new organization
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Crafted Climate Ghana"
 *     responses:
 *       201:
 *         description: Organization created successfully
 *       500:
 *         description: Server error
 */
router.post("/create", authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    const userid = req.user.userid;

    if (!name) {
      return res.status(400).json({ message: "Organization name is required" });
    }

    const organizationId = nanoid(14);

    const org = await Organization.create({
      organizationId,
      name,
      createdBy: userid,
      collaborators: [
        {
          userid: userid,
          role: "org-admin",
          joinedAt: new Date()
        }
      ]
    });

    // Add org to user’s profile
    await User.updateOne(
      { userid },
      {
        $push: { organization: organizationId },
        $set: {
          currentOrganizationId: organizationId,
          personalOrganizationId: organizationId
        }
      }
    );

    return res.status(201).json({
      message: "Organization created successfully",
      organization: org
    });

  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});



/* ========================================================================
 * 2. LIST ORGANIZATIONS OF USER
 * ======================================================================== */

router.get("/my-organizations",
  authenticateToken,
  async (req, res) => {
    try {
      const user = await User.findOne({ userid: req.user.userid });

      const orgs = await Organization.find({
        organizationId: { $in: user.organization }
      });

      return res.status(200).json(orgs);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });



/* ========================================================================
 * 3. ADD USER TO ORGANIZATION (Admin only)
 * ======================================================================== */

/**
 * @swagger
 * /api/org/{orgId}/invite:
 *   post:
 *     tags: [Organizations]
 *     summary: Add a user to an organization
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, role]
 *             properties:
 *               email: { type: string }
 *               role:
 *                 type: string
 *                 enum: [org-admin, org-support, org-user]
 *     responses:
 *       200:
 *         description: User added successfully
 */
router.post(
  "/:orgId/invite",
  authenticateToken,
  checkOrgAccess("org.users.invite"),
  async (req, res) => {
    try {
      const { orgId } = req.params;
      const { email, role } = req.body;

      const user = await User.findOne({ email });
      if (!user) return res.status(404).json({ message: "User not found" });

      const org = await Organization.findOne({ organizationId: orgId });
      if (!org) return res.status(404).json({ message: "Organization not found" });

      const exists = org.collaborators.find(c => c.userid === user.userid);
      if (exists) {
        return res.status(400).json({ message: "User already in organization" });
      }

      org.collaborators.push({
        userid: user.userid,
        role,
        joinedAt: new Date()
      });

      await org.save();

      await User.updateOne(
        { userid: user.userid },
        { $push: { organization: orgId } }
      );

      return res.status(200).json({
        message: "User added to organization",
        organization: org
      });

    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);



/* ========================================================================
 * 4. UPDATE USER ROLE IN ORGANIZATION (Admin only)
 * ======================================================================== */

router.patch(
  "/:orgId/update-role",
  authenticateToken,
  checkOrgAccess("org.users.change-role"),
  async (req, res) => {
    try {
      const { orgId } = req.params;
      const { userid, role } = req.body;

      const org = await Organization.findOne({ organizationId: orgId });
      if (!org) return res.status(404).json({ message: "Organization not found" });

      const collab = org.collaborators.find(c => c.userid === userid);
      if (!collab) return res.status(404).json({ message: "User not in organization" });

      collab.role = role;

      await org.save();

      return res.status(200).json({
        message: "Role updated successfully",
        organization: org
      });

    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);



/* ========================================================================
 * 5. REMOVE USER FROM ORGANIZATION (Admin only)
 * ======================================================================== */

router.delete(
  "/:orgId/remove-user/:userid",
  authenticateToken,
  checkOrgAccess("org.users.remove"),
  async (req, res) => {
    try {
      const { orgId, userid } = req.params;

      const org = await Organization.findOne({ organizationId: orgId });
      if (!org) return res.status(404).json({ message: "Organization not found" });

      org.collaborators = org.collaborators.filter(c => c.userid !== userid);
      await org.save();

      await User.updateOne(
        { userid },
        { $pull: { organization: orgId } }
      );

      return res.status(200).json({ message: "User removed from organization" });

    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);



/* ========================================================================
 * 6. SWITCH ACTIVE ORGANIZATION
 * ======================================================================== */

router.post(
  "/select",
  authenticateToken,
  async (req, res) => {
    try {
      const { organizationId } = req.body;

      const user = await User.findOne({ userid: req.user.userid });

      if (!user.organization.includes(organizationId)) {
        return res.status(403).json({
          message: "User does not belong to this organization"
        });
      }

      user.currentOrganizationId = organizationId;
      await user.save();

      return res.status(200).json({
        message: "Active organization updated",
        currentOrganizationId: organizationId
      });

    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);



/* ========================================================================
 * 7. GET ORGANIZATION MEMBERS
 * ======================================================================== */

router.get(
  "/:orgId/members",
  authenticateToken,
  checkOrgAccess("org.users.view"),
  async (req, res) => {
    try {
      const { orgId } = req.params;

      const org = await Organization.findOne({ organizationId: orgId });
      if (!org) return res.status(404).json({ message: "Organization not found" });

      const userIds = org.collaborators.map(c => c.userid);
      const members = await User.find(
        { userid: { $in: userIds } },
        "userid username email"
      );

      return res.status(200).json({
        organizationId: orgId,
        members
      });

    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);



/* ========================================================================
 * 8. DELETE ORGANIZATION (ADMIN or ORG-ADMIN only)
 * ======================================================================== */

/**
 * @swagger
 * /api/org/{orgId}/delete:
 *   delete:
 *     summary: Delete an organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     description: >
 *       Permanently deletes an organization and all its related data.\
 *       Can only be performed by Platform Admin or Organization Admin.\
 *       Removes the organization from all users, deletes all deployments and devices.
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID to delete
 *     responses:
 *       200:
 *         description: Organization successfully deleted
 *       403:
 *         description: Forbidden — insufficient permissions
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Internal server error
 */
router.delete(
  "/:orgId/delete",
  authenticateToken,
  async (req, res) => {
    try {
      const { orgId } = req.params;
      const requestingUserId = req.user.userid;

      // Check if organization exists
      const org = await Organization.findOne({ organizationId: orgId });
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Check if user is Platform Admin OR Org-Admin
      const isAdmin = req.user.role === 'admin'; // Platform admin
      const orgAdmin = org.collaborators.find(c => c.userid === requestingUserId && c.role === 'org-admin');

      if (!isAdmin && !orgAdmin) {
        return res.status(403).json({
          message: "Forbidden: Only platform admins or organization admins can delete an organization"
        });
      }

      // Get all users in the organization
      const userIds = org.collaborators.map(c => c.userid);

      // Step 1: Remove organization from all users
      await User.updateMany(
        { userid: { $in: userIds } },
        { $pull: { organization: orgId } }
      );

      // Step 2: Delete all deployments in the organization
      const Deployment = require('../../model/deployment/deploymentModel');
      await Deployment.deleteMany({ organizationId: orgId });

      // Step 3: Delete all devices in the organization
      const RegisteredDevice = require('../../model/devices/registerDevice');
      await RegisteredDevice.deleteMany({ organizationId: orgId });

      // Step 4: Delete all subscriptions for the organization
      await UserSubscription.deleteMany({ organizationId: orgId });

      // Step 5: Delete the organization itself
      await Organization.deleteOne({ organizationId: orgId });

      return res.status(200).json({
        message: "Organization and all related data successfully deleted",
        organizationId: orgId
      });

    } catch (error) {
      console.error("Error deleting organization:", error);
      return res.status(500).json({
        message: "Error deleting organization",
        error: error.message
      });
    }
  }
);



module.exports = router;
