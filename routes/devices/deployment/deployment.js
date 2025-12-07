// routes/api/devices/deploymentRoutes.js

const express = require("express");
const router = express.Router();

const Deployment = require("../../../model/deployment/deploymentModel");
const RegisteredDevice = require("../../../model/devices/registerDevice");
const Organization = require("../../../model/organization/organizationModel");
const User = require("../../../model/user/userModel");

const authenticateToken = require("../../../middleware/user/bearermiddleware");

// ⬇️ Adjust these paths to your actual middleware files
const withOrgContext = require("../../../middleware/org/orgContext");
const requireOrgRole = require("../../../middleware/org/requireOrgRole");
const requireOrgPermission = require("../../../middleware/org/requireOrgPermission");
const withSubscription = require("../../../middleware/subscriptions/withSubscription");

const { nanoid } = require("nanoid");

// ============================================================================
//  DEPLOYMENT HELPERS
// ============================================================================

async function findDeploymentOr404(deploymentid, orgid) {
  const deployment = await Deployment.findOne({ deploymentid, orgid });
  if (!deployment) {
    const err = new Error("Deployment not found");
    err.statusCode = 404;
    throw err;
  }
  return deployment;
}

// ============================================================================
//  SWAGGER TAG
// ============================================================================
/**
 * @swagger
 * tags:
 *   name: Deployments
 *   description: Manage device deployments within an organization
 */

// ============================================================================
//  CREATE DEPLOYMENT
// ============================================================================
/**
 * @swagger
 * /api/devices/deployments:
 *   post:
 *     tags: [Deployments]
 *     summary: Create a new deployment in an organization
 *     description: >
 *       Create a new deployment under the active organization context.  
 *       Requires org role **owner/admin** or permission **manage_deployments**.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgid
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID in which to create the deployment.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Accra Air Quality – Campus A"
 *               description:
 *                 type: string
 *                 example: "Deployment for rooftop sensors at Campus A"
 *     responses:
 *       201:
 *         description: Deployment created successfully.
 *       400:
 *         description: A deployment with this name already exists in the org.
 *       401:
 *         description: Unauthorized (missing or invalid token).
 *       403:
 *         description: Forbidden (insufficient org permissions or subscription).
 *       404:
 *         description: Organization not found or user not in org.
 *       500:
 *         description: Internal server error.
 */
router.post(
  "/deployments",
  authenticateToken,
  withOrgContext, // sets req.orgContext = { orgid, role, permissions, org }
  requireOrgPermission("manage_deployments"),
  withSubscription({
    scope: "organization",
    feature: "device_update", // creating deployments is a "management" action
    quotaKey: null,
    logType: "deployment_created"
  }),
  async (req, res) => {
    try {
      const { orgid } = req.orgContext;
      const { userid } = req.user;
      const { name, description } = req.body;

      // Ensure unique name per org
      const existing = await Deployment.findOne({ orgid, name });
      if (existing) {
        return res
          .status(400)
          .json({ message: "Deployment with this name already exists in this org." });
      }

      // Optional: enforce org-level maxDeployments from Organization.settings
      const org = req.orgContext.org || (await Organization.findOne({ orgid }));
      if (org?.settings?.maxDeployments) {
        const count = await Deployment.countDocuments({ orgid });
        if (count >= org.settings.maxDeployments) {
          return res.status(403).json({
            message: "Deployment limit reached for this organization.",
            limit: org.settings.maxDeployments
          });
        }
      }

      const deploymentid = nanoid(10);

      const deployment = await Deployment.create({
        deploymentid,
        orgid,
        createdBy: userid,
        name,
        description: description || ""
      });

      return res.status(201).json({
        message: "Deployment created successfully",
        deployment
      });
    } catch (err) {
      console.error("Create deployment error:", err);
      res.status(err.statusCode || 500).json({
        message: err.message || "Internal server error"
      });
    }
  }
);

// ============================================================================
//  GET SINGLE DEPLOYMENT
// ============================================================================
/**
 * @swagger
 * /api/devices/deployments/{deploymentId}:
 *   get:
 *     tags: [Deployments]
 *     summary: Get a deployment by ID
 *     description: >
 *       Returns deployment details if the user belongs to the organization
 *       and has at least **viewer** access.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: orgid
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID that owns this deployment.
 *     responses:
 *       200:
 *         description: Deployment retrieved successfully.
 *       404:
 *         description: Deployment not found.
 *       500:
 *         description: Internal server error.
 */
router.get(
  "/deployments/:deploymentId",
  authenticateToken,
  withOrgContext,
  requireOrgRole(["owner", "admin", "member", "viewer"]),
  async (req, res) => {
    try {
      const { orgid } = req.orgContext;
      const { deploymentId } = req.params;

      const deployment = await findDeploymentOr404(deploymentId, orgid);
      return res.status(200).json({ deployment });
    } catch (err) {
      res.status(err.statusCode || 500).json({
        message: err.message || "Internal server error"
      });
    }
  }
);

// ============================================================================
//  LIST ALL DEPLOYMENTS IN ORG
// ============================================================================
/**
 * @swagger
 * /api/devices/deployments:
 *   get:
 *     tags: [Deployments]
 *     summary: List deployments for an organization
 *     description: >
 *       Returns all deployments under the specified organization.  
 *       User must belong to the org with at least **viewer** role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgid
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID to fetch deployments for.
 *     responses:
 *       200:
 *         description: List of deployments.
 *       404:
 *         description: Organization not found or user not in org.
 *       500:
 *         description: Internal server error.
 */
router.get(
  "/deployments",
  authenticateToken,
  withOrgContext,
  requireOrgRole(["owner", "admin", "member", "viewer"]),
  async (req, res) => {
    try {
      const { orgid } = req.orgContext;
      const deployments = await Deployment.find({ orgid }).sort({ createdAt: -1 });
      res.status(200).json({ deployments });
    } catch (err) {
      res.status(500).json({ message: "Internal server error", error: err.message });
    }
  }
);

// ============================================================================
//  UPDATE DEPLOYMENT
// ============================================================================
/**
 * @swagger
 * /api/devices/deployments/{deploymentId}:
 *   put:
 *     tags: [Deployments]
 *     summary: Update deployment details
 *     description: >
 *       Update the deployment name/description.  
 *       Requires org permission **manage_deployments**.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: orgid
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Updated Deployment Name"
 *               description:
 *                 type: string
 *                 example: "Updated description"
 *     responses:
 *       200:
 *         description: Deployment updated successfully.
 *       400:
 *         description: Duplicate name exists in org.
 *       404:
 *         description: Deployment not found.
 *       500:
 *         description: Internal server error.
 */
router.put(
  "/deployments/:deploymentId",
  authenticateToken,
  withOrgContext,
  requireOrgPermission("manage_deployments"),
  async (req, res) => {
    try {
      const { orgid } = req.orgContext;
      const { deploymentId } = req.params;
      const { name, description } = req.body;

      const deployment = await findDeploymentOr404(deploymentId, orgid);

      // Check for duplicate name inside the same org (excluding this deployment)
      if (name) {
        const duplicate = await Deployment.findOne({
          orgid,
          name,
          _id: { $ne: deployment._id }
        });
        if (duplicate) {
          return res
            .status(400)
            .json({ message: "Another deployment with this name already exists in this org." });
        }
        deployment.name = name;
      }

      if (typeof description === "string") {
        deployment.description = description;
      }

      await deployment.save();
      res.status(200).json({ deployment });
    } catch (err) {
      res.status(err.statusCode || 500).json({
        message: err.message || "Internal server error"
      });
    }
  }
);

// ============================================================================
//  DELETE DEPLOYMENT
// ============================================================================
/**
 * @swagger
 * /api/devices/deployments/{deploymentId}:
 *   delete:
 *     tags: [Deployments]
 *     summary: Delete a deployment
 *     description: >
 *       Delete a deployment and disassociate all devices in it.  
 *       Requires org permission **manage_deployments**.  
 *       Devices remain registered to the org but are detached from this deployment.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: orgid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deployment deleted successfully.
 *       404:
 *         description: Deployment not found.
 *       500:
 *         description: Internal server error.
 */
router.delete(
  "/deployments/:deploymentId",
  authenticateToken,
  withOrgContext,
  requireOrgPermission("manage_deployments"),
  withSubscription({
    scope: "organization",
    feature: "device_update",
    quotaKey: null,
    logType: "deployment_deleted"
  }),
  async (req, res) => {
    try {
      const { orgid } = req.orgContext;
      const { deploymentId } = req.params;

      const deployment = await findDeploymentOr404(deploymentId, orgid);

      // Detach devices from this deployment
      await RegisteredDevice.updateMany(
        { deploymentid: deploymentId, orgid },
        { $set: { deploymentid: null } }
      );

      await Deployment.deleteOne({ _id: deployment._id });

      res.status(200).json({ message: "Deployment deleted successfully" });
    } catch (err) {
      res.status(err.statusCode || 500).json({
        message: err.message || "Internal server error"
      });
    }
  }
);

// ============================================================================
//  GET DEVICES IN DEPLOYMENT
// ============================================================================
/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/devices:
 *   get:
 *     tags: [Deployments]
 *     summary: Get devices in a deployment
 *     description: >
 *       Returns all devices associated with the given deployment.  
 *       User must at least have **viewer** role in the org.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: orgid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Devices retrieved successfully.
 *       404:
 *         description: Deployment not found.
 *       500:
 *         description: Internal server error.
 */
router.get(
  "/deployments/:deploymentId/devices",
  authenticateToken,
  withOrgContext,
  requireOrgRole(["owner", "admin", "member", "viewer"]),
  async (req, res) => {
    try {
      const { orgid } = req.orgContext;
      const { deploymentId } = req.params;

      await findDeploymentOr404(deploymentId, orgid);

      const devices = await RegisteredDevice.find({
        deploymentid: deploymentId,
        orgid
      });

      res.status(200).json({ devices });
    } catch (err) {
      res.status(err.statusCode || 500).json({
        message: err.message || "Internal server error"
      });
    }
  }
);

// ============================================================================
//  ADD DEVICE TO DEPLOYMENT
// ============================================================================
/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/devices:
 *   post:
 *     tags: [Deployments]
 *     summary: Add a device to a deployment
 *     description: >
 *       Attach a registered device (by AUID) to a deployment.  
 *       The device must belong to the same org.  
 *       Requires permission **manage_devices**.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: orgid
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - auid
 *             properties:
 *               auid:
 *                 type: string
 *                 example: "CSENV-ABC123"
 *     responses:
 *       200:
 *         description: Device added to deployment successfully.
 *       400:
 *         description: Device already belongs to a deployment or wrong org.
 *       404:
 *         description: Deployment or device not found.
 *       500:
 *         description: Internal server error.
 */
router.post(
  "/deployments/:deploymentId/devices",
  authenticateToken,
  withOrgContext,
  requireOrgPermission("manage_devices"),
  withSubscription({
    scope: "organization",
    feature: "device_update",
    quotaKey: null,
    logType: "device_added_to_deployment"
  }),
  async (req, res) => {
    try {
      const { orgid } = req.orgContext;
      const { deploymentId } = req.params;
      const { auid } = req.body;

      const deployment = await findDeploymentOr404(deploymentId, orgid);

      const device = await RegisteredDevice.findOne({ auid });
      if (!device) {
        return res.status(404).json({ message: "Device not found" });
      }

      if (device.orgid !== orgid) {
        return res
          .status(400)
          .json({ message: "Device does not belong to this organization" });
      }

      if (device.deploymentid && device.deploymentid !== deploymentId) {
        return res
          .status(400)
          .json({ message: "Device is already associated with another deployment" });
      }

      if (!deployment.devices.includes(auid)) {
        deployment.devices.push(auid);
      }

      device.deploymentid = deploymentId;

      await deployment.save();
      await device.save();

      res.status(200).json({ message: "Device added to deployment successfully" });
    } catch (err) {
      res.status(err.statusCode || 500).json({
        message: err.message || "Internal server error"
      });
    }
  }
);

// ============================================================================
//  REMOVE DEVICE FROM DEPLOYMENT
// ============================================================================
/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/devices/{auid}:
 *   delete:
 *     tags: [Deployments]
 *     summary: Remove a device from a deployment
 *     description: >
 *       Detach a device from the given deployment (device remains in org).  
 *       Requires permission **manage_devices**.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: auid
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: orgid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Device removed from deployment successfully.
 *       404:
 *         description: Device or deployment not found.
 *       400:
 *         description: Device is not associated with this deployment.
 *       500:
 *         description: Internal server error.
 */
router.delete(
  "/deployments/:deploymentId/devices/:auid",
  authenticateToken,
  withOrgContext,
  requireOrgPermission("manage_devices"),
  withSubscription({
    scope: "organization",
    feature: "device_update",
    quotaKey: null,
    logType: "device_removed_from_deployment"
  }),
  async (req, res) => {
    try {
      const { orgid } = req.orgContext;
      const { deploymentId, auid } = req.params;

      const deployment = await findDeploymentOr404(deploymentId, orgid);

      const device = await RegisteredDevice.findOne({ auid, orgid });
      if (!device) {
        return res.status(404).json({ message: "Device not found in this org" });
      }

      if (device.deploymentid !== deploymentId) {
        return res
          .status(400)
          .json({ message: "Device is not associated with this deployment" });
      }

      device.deploymentid = null;
      deployment.devices = deployment.devices.filter((d) => d !== auid);

      await device.save();
      await deployment.save();

      res.status(200).json({ message: "Device removed from deployment successfully" });
    } catch (err) {
      res.status(err.statusCode || 500).json({
        message: err.message || "Internal server error"
      });
    }
  }
);

// ============================================================================
//  SEARCH DEPLOYMENTS (BY NAME) WITHIN ORG
// ============================================================================
/**
 * @swagger
 * /api/devices/deployments/search:
 *   get:
 *     tags: [Deployments]
 *     summary: Search deployments by name within an organization
 *     description: >
 *       Performs a text search on deployment names/descriptions in the specified org.  
 *       Requires user to belong to the org.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgid
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           description: Search query string.
 *     responses:
 *       200:
 *         description: Matching deployments.
 *       500:
 *         description: Internal server error.
 */
router.get(
  "/deployments/search",
  authenticateToken,
  withOrgContext,
  requireOrgRole(["owner", "admin", "member", "viewer"]),
  async (req, res) => {
    try {
      const { orgid } = req.orgContext;
      const { q } = req.query;

      const deployments = await Deployment.find({
        orgid,
        $text: { $search: q }
      });

      res.status(200).json({ deployments });
    } catch (err) {
      res.status(500).json({ message: "Internal server error", error: err.message });
    }
  }
);

// ============================================================================
//  LIST COLLABORATORS IN DEPLOYMENT
// ============================================================================
/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/collaborators:
 *   get:
 *     tags: [Deployments]
 *     summary: List collaborators in a deployment
 *     description: >
 *       Returns collaborators for the deployment (userid, role, permissions, plus user profile fields).  
 *       Requires org permission **manage_deployments**.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: orgid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of collaborators.
 *       404:
 *         description: Deployment not found.
 *       500:
 *         description: Internal server error.
 */
router.get(
  "/deployments/:deploymentId/collaborators",
  authenticateToken,
  withOrgContext,
  requireOrgPermission("manage_deployments"),
  async (req, res) => {
    try {
      const { orgid } = req.orgContext;
      const { deploymentId } = req.params;

      const deployment = await findDeploymentOr404(deploymentId, orgid);

      const userIds = deployment.collaborators.map((c) => c.userid);

      const users = await User.find({ userid: { $in: userIds } }).select(
        "userid email firstName lastName"
      );

      const joined = deployment.collaborators.map((c) => {
        const u = users.find((x) => x.userid === c.userid);
        return {
          userid: c.userid,
          role: c.role,
          permissions: c.permissions,
          addedAt: c.addedAt,
          profile: u || null
        };
      });

      res.status(200).json({ collaborators: joined });
    } catch (err) {
      res.status(err.statusCode || 500).json({
        message: err.message || "Internal server error"
      });
    }
  }
);

// ============================================================================
//  INVITE / ADD COLLABORATOR BY EMAIL
// ============================================================================
/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/collaborators:
 *   post:
 *     tags: [Deployments]
 *     summary: Add a collaborator to a deployment by email
 *     description: >
 *       Adds an existing user (already a member of the org) as a deployment collaborator.  
 *       Requires org permission **manage_deployments**.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: orgid
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: "collab@example.com"
 *               role:
 *                 type: string
 *                 enum: [admin, editor, viewer]
 *                 example: "viewer"
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["view_telemetry"]
 *     responses:
 *       200:
 *         description: Collaborator added successfully.
 *       400:
 *         description: User not in org or already a collaborator.
 *       404:
 *         description: Deployment or user not found.
 *       500:
 *         description: Internal server error.
 */
router.post(
  "/deployments/:deploymentId/collaborators",
  authenticateToken,
  withOrgContext,
  requireOrgPermission("manage_deployments"),
  async (req, res) => {
    try {
      const { orgid } = req.orgContext;
      const { deploymentId } = req.params;
      const { email, role, permissions } = req.body;

      const deployment = await findDeploymentOr404(deploymentId, orgid);

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Ensure user is a member of the org
      const membership = user.orgMemberships?.find((m) => m.orgid === orgid && m.status === "active");
      if (!membership) {
        return res
          .status(400)
          .json({ message: "User is not an active member of this organization" });
      }

      const existing = deployment.collaborators.find((c) => c.userid === user.userid);
      if (existing) {
        return res.status(400).json({ message: "User already a collaborator in this deployment" });
      }

      deployment.collaborators.push({
        userid: user.userid,
        role: role || "viewer",
        permissions: Array.isArray(permissions) ? permissions : []
      });

      await deployment.save();

      res.status(200).json({ message: "Collaborator added successfully" });
    } catch (err) {
      res.status(err.statusCode || 500).json({
        message: err.message || "Internal server error"
      });
    }
  }
);

// ============================================================================
//  REMOVE COLLABORATOR
// ============================================================================
/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/collaborators/{targetUserid}:
 *   delete:
 *     tags: [Deployments]
 *     summary: Remove a collaborator from a deployment
 *     description: >
 *       Removes a collaborator from the deployment.  
 *       Requires org permission **manage_deployments**.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: targetUserid
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: orgid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Collaborator removed successfully.
 *       404:
 *         description: Deployment or collaborator not found.
 *       500:
 *         description: Internal server error.
 */
router.delete(
  "/deployments/:deploymentId/collaborators/:targetUserid",
  authenticateToken,
  withOrgContext,
  requireOrgPermission("manage_deployments"),
  async (req, res) => {
    try {
      const { orgid } = req.orgContext;
      const { deploymentId, targetUserid } = req.params;

      const deployment = await findDeploymentOr404(deploymentId, orgid);

      const before = deployment.collaborators.length;
      deployment.collaborators = deployment.collaborators.filter(
        (c) => c.userid !== targetUserid
      );

      if (deployment.collaborators.length === before) {
        return res.status(404).json({ message: "Collaborator not found in deployment" });
      }

      await deployment.save();

      res.status(200).json({ message: "Collaborator removed successfully" });
    } catch (err) {
      res.status(err.statusCode || 500).json({
        message: err.message || "Internal server error"
      });
    }
  }
);

module.exports = router;
