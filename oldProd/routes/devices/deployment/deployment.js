/**
 * DEPLOYMENT ROUTES — MULTI-TENANT + RBAC + BACKWARD COMPATIBLE
 */

const express = require('express');
const router = express.Router();

const Deployment = require('../../../model/deployment/deploymentModel');
const RegisteredDevice = require('../../../model/devices/registerDevice');
const User = require('../../../model/user/userModel');
const Organization = require('../../../model/organization/organizationModel');

const authenticateToken = require('../../../middleware/bearermiddleware');
const checkOrgAccess = require('../../../middleware/organization/checkOrgAccess');

const { nanoid } = require('nanoid');


/* ======================================================================
 *  SWAGGER HEADER DEFINITION FOR ORG-ID
 * ====================================================================== */
/**
 * @swagger
 * components:
 *   securitySchemes:
 *     orgIdHeader:
 *       type: apiKey
 *       in: header
 *       name: x-org-id
 *       description: |
 *         Organization ID for multi-tenant routing.
 *         If not provided, the system falls back to `currentOrganizationId`
 *         stored on the authenticated user.
 */


/* ======================================================================
 *  CREATE DEPLOYMENT
 * ====================================================================== */
/**
 * @swagger
 * /api/devices/deployments:
 *   post:
 *     tags: [Deployments]
 *     summary: Create a new deployment inside the selected organization
 *     description: |
 *       Creates a deployment under the active organization.  
 *       Requires **org.deployments.create** permission.
 *
 *       The active organization is determined by:
 *       - `x-org-id` header, OR  
 *       - user.currentOrganizationId
 *     security:
 *       - bearerAuth: []
 *       - orgIdHeader: []
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
 *                 example: "Community Air Monitoring"
 *               description:
 *                 type: string
 *                 example: "Deployment for PM + Gas sensors"
 *     responses:
 *       201:
 *         description: Deployment created successfully
 *       403:
 *         description: Forbidden — insufficient permissions
 *       400:
 *         description: Organization not selected or duplicate name
 *       500:
 *         description: Internal server error
 */
router.post(
  '/deployments',
  authenticateToken,
  checkOrgAccess('org.deployments.create'),
  async (req, res) => {
    try {
      const { name, description } = req.body;
      const userid = req.user.userid;
      const organizationId = req.currentOrgId;

      if (!organizationId) {
        return res.status(400).json({
          message: "User has not selected an active organization."
        });
      }

      // Prevent duplicate deployment names inside the same org
      const existing = await Deployment.findOne({ organizationId, name });
      if (existing) {
        return res.status(400).json({
          message: "Deployment name already exists in this organization."
        });
      }

      const deploymentid = `dep-${nanoid(12)}`;

      const deployment = await Deployment.create({
        deploymentid,
        userid,         // backward compatibility
        createdBy: userid,
        organizationId,
        name,
        description
      });

      // Update organization to include this deployment
      await Organization.findOneAndUpdate(
        { organizationId },                  // filter object
        { $addToSet: { deployments: deploymentid } },
        { new: true }
      );
      return res.status(201).json({
        message: "Deployment created successfully",
        deployment
      });

    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);



/* ======================================================================
 *  GET ONE DEPLOYMENT BY ID
 * ====================================================================== */
/**
 * @swagger
 * /api/devices/deployments/{deploymentId}:
 *   get:
 *     tags: [Deployments]
 *     summary: Get a deployment by ID (Tenant-scoped)
 *     description: |
 *       Returns a deployment only if it belongs to the active organization.  
 *       Requires **org.deployments.view** permission.
 *     security:
 *       - bearerAuth: []
 *       - orgIdHeader: []
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema:
 *           type: string
 *         example: dep-abc123xyz
 *     responses:
 *       200:
 *         description: Deployment returned successfully
 *       404:
 *         description: Deployment not found in organization
 */
router.get(
  '/deployments/:deploymentId',
  authenticateToken,
  checkOrgAccess('org.deployments.view'),
  async (req, res) => {
    try {
      const { deploymentId } = req.params;

      const deployment = await Deployment.findOne({
        deploymentid: deploymentId,
        organizationId: req.currentOrgId
      });

      if (!deployment) {
        return res.status(404).json({
          message: "Deployment not found in this organization"
        });
      }

      return res.status(200).json({ deployment });

    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);



/* ======================================================================
 *  LIST DEVICES IN DEPLOYMENT
 * ====================================================================== */
/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/devices:
 *   get:
 *     tags: [Deployments]
 *     summary: List all devices inside a deployment
 *     description: |
 *       Returns devices ONLY if they belong to the same organization.  
 *       Requires **org.deployments.view** permission.
 *     security:
 *       - bearerAuth: []
 *       - orgIdHeader: []
 *     parameters:
 *       - name: deploymentId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Device list
 *       404:
 *         description: Deployment not found
 */
router.get(
  '/deployments/:deploymentId/devices',
  authenticateToken,
  checkOrgAccess('org.deployments.view'),
  async (req, res) => {
    try {
      const { deploymentId } = req.params;

      const deployment = await Deployment.findOne({
        deploymentid: deploymentId,
        organizationId: req.currentOrgId
      });

      if (!deployment) {
        return res.status(404).json({ message: "Deployment not found in this organization" });
      }

      // 🔗 Use organizationId (new field) for consistency
      const devices = await RegisteredDevice.find({
        auid: { $in: deployment.devices },
        organizationId: req.currentOrgId
      });

      return res.status(200).json({ devices });

    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);



/* ======================================================================
 *  UPDATE DEPLOYMENT
 * ====================================================================== */
/**
 * @swagger
 * /api/devices/deployments/{deploymentId}:
 *   patch:
 *     tags: [Deployments]
 *     summary: Update deployment name/description
 *     description: |
 *       Only allowed for users with **org.deployments.edit** permission.
 *     security:
 *       - bearerAuth: []
 *       - orgIdHeader: []
 *     parameters:
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Updated Name"
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Deployment updated
 *       404:
 *         description: Deployment not found
 */
router.patch(
  '/deployments/:deploymentId',
  authenticateToken,
  checkOrgAccess('org.deployments.edit'),
  async (req, res) => {
    try {
      const { deploymentId } = req.params;
      const { name, description } = req.body;

      const deployment = await Deployment.findOne({
        deploymentid: deploymentId,
        organizationId: req.currentOrgId
      });

      if (!deployment) {
        return res.status(404).json({ message: 'Deployment not found' });
      }

      // Prevent duplicate names
      if (name) {
        const duplicate = await Deployment.findOne({
          deploymentid: { $ne: deploymentId },
          name,
          organizationId: req.currentOrgId
        });

        if (duplicate) {
          return res.status(400).json({
            message: "A deployment with this name already exists."
          });
        }
      }

      deployment.name = name ?? deployment.name;
      deployment.description = description ?? deployment.description;
      await deployment.save();

      return res.status(200).json({ deployment });

    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);



/* ======================================================================
 *  DELETE DEPLOYMENT
 * ====================================================================== */
/**
 * @swagger
 * /api/devices/deployments/{deploymentId}:
 *   delete:
 *     tags: [Deployments]
 *     summary: Delete a deployment
 *     description: |
 *       Deletes a deployment and unassigns all devices.  
 *       Requires **org.deployments.delete** permission.
 *     security:
 *       - bearerAuth: []
 *       - orgIdHeader: []
 *     parameters:
 *       - name: deploymentId
 *         in: path
 *         required: true
 *     responses:
 *       200:
 *         description: Deleted successfully
 *       404:
 *         description: Deployment not found
 */
router.delete(
  '/deployments/:deploymentId',
  authenticateToken,
  checkOrgAccess('org.deployments.delete'),
  async (req, res) => {
    try {
      const { deploymentId } = req.params;

      const deployment = await Deployment.findOne({
        deploymentid: deploymentId,
        organizationId: req.currentOrgId
      });

      if (!deployment) {
        return res.status(404).json({ message: 'Deployment not found' });
      }

      // Unassign devices
      await RegisteredDevice.updateMany(
        { deployment: deploymentId },
        { $set: { deployment: null, deploymentId: null } }
      );

      await Deployment.deleteOne({ deploymentid: deploymentId });

      // Remove deployment from organization
       await Organization.findOneAndUpdate(
        { organizationId: req.currentOrgId },
        { $pull: { deployments: deploymentId } },
        { new: true }
      );

      return res.status(200).json({
        message: "Deployment deleted successfully"
      });

    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);



/* ======================================================================
 *  ADD DEVICE TO DEPLOYMENT
 * ====================================================================== */
/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/devices:
 *   post:
 *     tags: [Deployments]
 *     summary: Add a device to a deployment
 *     description: Assigns a device to a deployment inside the same organization.
 *     security:
 *       - bearerAuth: []
 *       - orgIdHeader: []
 *     parameters:
 *       - name: deploymentId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [auid]
 *             properties:
 *               auid:
 *                 type: string
 *                 example: "GH-XXXXXX"
 *     responses:
 *       200:
 *         description: Device added
 *       400:
 *         description: Missing or invalid data
 *       404:
 *         description: Deployment or device not found
 */
router.post(
  '/deployments/:deploymentId/devices',
  authenticateToken,
  checkOrgAccess('org.deployments.edit'),
  async (req, res) => {
    try {
      const { deploymentId } = req.params;
      const { auid } = req.body || {};

      if (!auid) {
        return res.status(400).json({ message: "Missing required field: auid" });
      }

      const deployment = await Deployment.findOne({
        deploymentid: deploymentId,
        organizationId: req.currentOrgId
      });

      if (!deployment) {
        return res.status(404).json({ message: 'Deployment not found' });
      }

      const device = await RegisteredDevice.findOne({
        auid,
        organizationId: req.currentOrgId
      });

      if (!device) {
        return res.status(404).json({ message: 'Device not found in this organization' });
      }

      if (device.deployment) {
        return res.status(400).json({ message: 'Device already belongs to a deployment' });
      }

      // Assign device → deployment
      device.deployment = deploymentId;
      device.deploymentId = deploymentId;
      await device.save();

      deployment.devices.push(auid);
      await deployment.save();

      // ensure organization.devices includes this
      await Organization.findOneAndUpdate(
        { organizationId: req.currentOrgId },
        { $addToSet: { devices: auid } },
        { new: true }
      );

      return res.status(200).json({ message: 'Device added successfully to deployment' });

    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);




/* ======================================================================
 *  REMOVE DEVICE FROM DEPLOYMENT
 * ====================================================================== */
/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/devices/{auid}:
 *   delete:
 *     tags: [Deployments]
 *     summary: Remove a device from a deployment
 *     description: |
 *       Unassigns a device.  
 *       Requires **org.deployments.edit** permission.
 *     security:
 *       - bearerAuth: []
 *       - orgIdHeader: []
 *     parameters:
 *       - name: deploymentId
 *         in: path
 *         required: true
 *       - name: auid
 *         in: path
 *         required: true
 *     responses:
 *       200:
 *         description: Device removed
 *       404:
 *         description: Deployment not found
 */
router.delete(
  '/deployments/:deploymentId/devices/:auid',
  authenticateToken,
  checkOrgAccess('org.deployments.edit'),
  async (req, res) => {
    try {
      const { deploymentId, auid } = req.params;

      const deployment = await Deployment.findOne({
        deploymentid: deploymentId,
        organizationId: req.currentOrgId
      });

      if (!deployment) return res.status(404).json({ message: 'Deployment not found' });

      // 🔗 Use organizationId (new field) for consistency
      const device = await RegisteredDevice.findOne({
        auid,
        organizationId: req.currentOrgId
      });

      if (!device || device.deployment !== deploymentId) {
        return res.status(400).json({
          message: "Device does not belong to this deployment"
        });
      }

      device.deployment = null;
      device.deploymentId = null;
      await device.save();

      deployment.devices = deployment.devices.filter(id => id !== auid);
      await deployment.save();

      // 🔗 REFERENTIAL INTEGRITY: Ensure organization devices array is still synced
      // (Device remains in org.devices even though it's removed from deployment)
       await Organization.findOneAndUpdate(
        { organizationId: req.currentOrgId },
        { $pull: { devices: auid } },
        { new: true }
      );

      return res.status(200).json({ message: 'Device removed successfully from deployment, remains in organization' });

    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);



/* ======================================================================
 *  LIST ALL DEPLOYMENTS IN ACTIVE ORG
 * ====================================================================== */
/**
 * @swagger
 * /api/devices/deployments:
 *   get:
 *     tags: [Deployments]
 *     summary: List deployments in the currently selected organization
 *     description: |
 *       Returns all deployments inside the active tenant.  
 *       Requires **org.deployments.view** permission.
 *     security:
 *       - bearerAuth: []
 *       - orgIdHeader: []
 *     responses:
 *       200:
 *         description: List of deployments
 */
router.get(
  '/deployments',
  authenticateToken,
  checkOrgAccess('org.deployments.view'),
  async (req, res) => {
    try {
      const deployments = await Deployment.find({
        organizationId: req.currentOrgId
      });

      return res.status(200).json({ deployments });

    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);


module.exports = router;
