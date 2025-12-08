

const express = require('express');
const router = express.Router();
const axios = require('axios');

const RegisteredDevice = require('../../model/devices/registerDevice');
const Deployment = require('../../model/deployment/deploymentModel');

const authenticateToken = require('../../middleware/bearermiddleware');
const checkOrgAccess = require('../../middleware/organization/checkOrgAccess');


/* ======================================================================
 *  LIST DEVICES IN ORGANIZATION
 * ====================================================================== */
/**
 * @swagger
 * /api/org/{orgId}/devices:
 *   get:
 *     tags:
 *       - Devices (Organization Scoped)
 *     summary: List all devices in an organization
 *     description: |
 *       Fetch all devices that belong to the selected organization.  
 *       Requires permission `org.devices.view`.
 *     security:
 *       - bearerAuth: []
 *       - orgIdHeader: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *     responses:
 *       200:
 *         description: List of devices
 *       400:
 *         description: Organization mismatch
 *       500:
 *         description: Server error
 */
router.get(
  '/:orgId/devices',
  authenticateToken,
  checkOrgAccess('org.devices.view'),
  async (req, res) => {
    try {
      const { orgId } = req.params;
      const currentOrgId = req.currentOrgId;

      if (currentOrgId && currentOrgId !== orgId) {
        return res.status(400).json({
          message: 'Organization mismatch between header/context and URL parameter.'
        });
      }

      const effectiveOrgId = currentOrgId || orgId;

      const devices = await RegisteredDevice.find({ organization: effectiveOrgId });

      return res.status(200).json(devices);
    } catch (err) {
      console.error('Error listing org devices:', err);
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);


/* ======================================================================
 *  GET SINGLE DEVICE IN ORGANIZATION
 * ====================================================================== */
/**
 * @swagger
 * /api/org/{orgId}/devices/{auid}:
 *   get:
 *     tags:
 *       - Devices (Organization Scoped)
 *     summary: Get a single device in an organization
 *     description: |
 *       Fetch a device by AUID within the selected organization.  
 *       Requires permission `org.devices.view`.
 *     security:
 *       - bearerAuth: []
 *       - orgIdHeader: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *       - in: path
 *         name: auid
 *         required: true
 *         schema:
 *           type: string
 *         description: Device AUID
 *     responses:
 *       200:
 *         description: Device details
 *       400:
 *         description: Organization mismatch
 *       404:
 *         description: Device not found
 *       500:
 *         description: Server error
 */
router.get(
  '/:orgId/devices/:auid',
  authenticateToken,
  checkOrgAccess('org.devices.view'),
  async (req, res) => {
    try {
      const { orgId, auid } = req.params;
      const currentOrgId = req.currentOrgId;

      if (currentOrgId && currentOrgId !== orgId) {
        return res.status(400).json({
          message: 'Organization mismatch between header/context and URL parameter.'
        });
      }

      const effectiveOrgId = currentOrgId || orgId;

      const device = await RegisteredDevice.findOne({
        auid,
        organization: effectiveOrgId
      });

      if (!device) {
        return res.status(404).json({ message: 'Device not found in this organization.' });
      }

      return res.status(200).json(device);
    } catch (err) {
      console.error('Error fetching org device:', err);
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);


/* ======================================================================
 *  UPDATE DEVICE IN ORGANIZATION
 * ====================================================================== */
/**
 * @swagger
 * /api/org/{orgId}/devices/{auid}:
 *   put:
 *     tags:
 *       - Devices (Organization Scoped)
 *     summary: Update a device (org scoped)
 *     description: |
 *       Update nickname and/or location of a device that belongs to the selected organization.  
 *       Requires permission `org.devices.edit`.
 *     security:
 *       - bearerAuth: []
 *       - orgIdHeader: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *       - in: path
 *         name: auid
 *         required: true
 *         schema:
 *           type: string
 *         description: Device AUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nickname:
 *                 type: string
 *               location:
 *                 type: array
 *                 items:
 *                   type: number
 *                 description: An array of [latitude, longitude]
 *                 example: [5.5605, -0.2057]
 *     responses:
 *       200:
 *         description: Device updated successfully
 *       400:
 *         description: Invalid data or org mismatch
 *       404:
 *         description: Device not found
 *       500:
 *         description: Server error
 */
router.put(
  '/:orgId/devices/:auid',
  authenticateToken,
  checkOrgAccess('org.devices.edit'),
  async (req, res) => {
    const { orgId, auid } = req.params;
    const { nickname, location } = req.body;

    if (!nickname && !location) {
      return res.status(400).json({
        message: 'Please provide at least one of: nickname or location.'
      });
    }

    try {
      const currentOrgId = req.currentOrgId;

      if (currentOrgId && currentOrgId !== orgId) {
        return res.status(400).json({
          message: 'Organization mismatch between header/context and URL parameter.'
        });
      }

      const effectiveOrgId = currentOrgId || orgId;

      const device = await RegisteredDevice.findOne({
        auid,
        organization: effectiveOrgId
      });

      if (!device) {
        return res.status(404).json({ message: 'Device not found in this organization.' });
      }

      if (nickname) {
        device.nickname = nickname;
      }

      if (location) {
        if (
          !Array.isArray(location) ||
          location.length !== 2 ||
          typeof location[0] !== 'number' ||
          typeof location[1] !== 'number'
        ) {
          return res.status(400).json({
            message: 'Invalid location format. Must be [latitude, longitude].'
          });
        }

        const [latitude, longitude] = location;
        const geoRes = await axios.get(`https://atlas.microsoft.com/search/address/reverse/json`, {
          params: {
            'api-version': '1.0',
            'subscription-key': process.env.AZURE_MAPS_KEY,
            query: `${latitude},${longitude}`
          }
        });

        const address = geoRes?.data?.addresses?.[0]?.address || {};
        device.location = JSON.stringify({
          country: address.country,
          region: address.countrySubdivision,
          city: address.municipality,
          postalCode: address.postalCode,
          street: address.street,
          municipality: address.municipality,
          municipalitySubdivision: address.municipalitySubdivision,
          latitude,
          longitude
        });
      }

      await device.save();

      return res.status(200).json({
        message: 'Device updated successfully.',
        device
      });
    } catch (err) {
      console.error('Error updating org device:', err);
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);


/* ======================================================================
 *  DELETE DEVICE FROM ORGANIZATION
 * ====================================================================== */
/**
 * @swagger
 * /api/org/{orgId}/devices/{auid}:
 *   delete:
 *     tags:
 *       - Devices (Organization Scoped)
 *     summary: Delete a device from an organization
 *     description: |
 *       Deletes a device that belongs to the selected organization and removes it from deployments.  
 *       Requires permission `org.devices.remove`.
 *     security:
 *       - bearerAuth: []
 *       - orgIdHeader: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *       - in: path
 *         name: auid
 *         required: true
 *         schema:
 *           type: string
 *         description: Device AUID
 *     responses:
 *       200:
 *         description: Device deleted successfully
 *       400:
 *         description: Organization mismatch
 *       404:
 *         description: Device not found
 *       500:
 *         description: Server error
 */
/* ======================================================================
 *  DELETE DEVICE FROM ORGANIZATION
 * ====================================================================== */
router.delete(
  '/:orgId/devices/:auid',
  authenticateToken,
  checkOrgAccess('org.devices.remove'),
  async (req, res) => {
    try {
      const { orgId, auid } = req.params;
      const currentOrgId = req.currentOrgId;

      if (currentOrgId && currentOrgId !== orgId) {
        return res.status(400).json({
          message: 'Organization mismatch between header/context and URL parameter.'
        });
      }

      const effectiveOrgId = currentOrgId || orgId;

      const device = await RegisteredDevice.findOne({
        auid,
        organization: effectiveOrgId
      });

      if (!device) {
        return res.status(404).json({ message: 'Device not found in this organization.' });
      }

      const { devid } = device;

      // Remove from deployments
      await Deployment.updateMany(
        { devices: devid },
        { $pull: { devices: devid } }
      );

      // Clear collaborators and delete device
      device.collaborators = [];
      await device.save();

      await RegisteredDevice.deleteOne({ _id: device._id });

      // 🔥 NEW: Remove device from organization.devices[]
      await Organization.updateOne(
        { organizationId: effectiveOrgId },
        { $pull: { devices: auid } }
      );

      return res.status(200).json({ message: 'Device successfully deleted from organization.' });
    } catch (err) {
      console.error('Error deleting org device:', err);
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);



/* ======================================================================
 *  RBAC DELETE DEVICE FROM ORGANIZATION
 * ====================================================================== */
/**
 * @swagger
 * /api/org/{orgId}/devices/{auid}/remove:
 *   delete:
 *     tags:
 *       - Devices (Organization Scoped)
 *     summary: RBAC — Delete a device inside an organization
 *     description: |
 *       Permanently deletes a device that belongs to an organization.  
 *       Requires **org.devices.remove** permission.  
 *       Also removes the device from all deployments and clears collaborators.
 *     security:
 *       - bearerAuth: []
 *       - orgIdHeader: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID the device belongs to.
 *       - in: path
 *         name: auid
 *         required: true
 *         schema:
 *           type: string
 *         description: AUID of the device to delete.
 *     responses:
 *       200:
 *         description: Device successfully deleted by org-admin.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       404:
 *         description: Device not found in the specified organization.
 *       403:
 *         description: Forbidden — insufficient RBAC permissions.
 *       500:
 *         description: Internal server error.
 */
/* ======================================================================
 *  RBAC DELETE DEVICE FROM ORGANIZATION
 * ====================================================================== */
router.delete(
  '/:orgId/devices/:auid/remove',
  authenticateToken,
  checkOrgAccess('org.devices.remove'),
  async (req, res) => {
    try {
      const { orgId, auid } = req.params;

      const device = await RegisteredDevice.findOne({ auid, organization: orgId });
      if (!device) {
        return res.status(404).json({ message: 'Device not found in organization' });
      }

      const { devid } = device;

      // Remove from deployments
      await Deployment.updateMany(
        { devices: devid },
        { $pull: { devices: devid } }
      );

      // Remove collaborators + delete device
      device.collaborators = [];
      await device.save();

      await RegisteredDevice.deleteOne({ _id: device._id });

      // 🔥 NEW: Remove device from organization.devices[]
      await Organization.updateOne(
        { organizationId: orgId },
        { $pull: { devices: auid } }
      );

      return res.status(200).json({ message: 'Device removed by org-admin' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);



/* ======================================================================
 *  MOVE DEVICE BETWEEN DEPLOYMENTS (RBAC)
 * ====================================================================== */
/**
 * @swagger
 * /api/org/{orgId}/devices/{auid}/move:
 *   post:
 *     tags:
 *       - Devices (Organization Scoped)
 *     summary: RBAC — Move a device between deployments
 *     description: |
 *       Moves a device from one deployment to another inside the same organization.  
 *       Requires **org.deployments.edit** permission.  
 *       Validates both deployments and device ownership under the organization.
 *     security:
 *       - bearerAuth: []
 *       - orgIdHeader: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *       - in: path
 *         name: auid
 *         required: true
 *         schema:
 *           type: string
 *         description: AUID of the device
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fromDeploymentId
 *               - toDeploymentId
 *             properties:
 *               fromDeploymentId:
 *                 type: string
 *                 example: "dep12345ABC"
 *               toDeploymentId:
 *                 type: string
 *                 example: "dep78XY9123"
 *     responses:
 *       200:
 *         description: Device moved successfully between deployments.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 toDeploymentId:
 *                   type: string
 *       400:
 *         description: Missing deployment IDs or organization mismatch.
 *       404:
 *         description: Deployment(s) or device not found in organization.
 *       403:
 *         description: Forbidden — insufficient RBAC permissions.
 *       500:
 *         description: Internal server error.
 */
router.post(
  '/:orgId/devices/:auid/move',
  authenticateToken,
  checkOrgAccess("org.deployments.edit"),
  async (req, res) => {
    try {
      const { orgId, auid } = req.params;
      const { fromDeploymentId, toDeploymentId } = req.body;

      if (!fromDeploymentId || !toDeploymentId) {
        return res.status(400).json({ message: 'Missing required deployment IDs' });
      }

      // Validate both deployments belong to same org
      const from = await Deployment.findOne({ deploymentid: fromDeploymentId, organizationId: orgId });
      const to   = await Deployment.findOne({ deploymentid: toDeploymentId, organizationId: orgId });

      if (!from || !to) {
        return res.status(404).json({ message: 'One or both deployments not found in organization' });
      }

      // Validate device belongs to org
      const device = await RegisteredDevice.findOne({ auid, organization: orgId });
      if (!device) {
        return res.status(404).json({ message: 'Device not found in organization' });
      }

      // Remove from old deployment
      from.devices = from.devices.filter(id => id !== auid);
      await from.save();

      // Add to new deployment
      to.devices.push(auid);
      await to.save();

      // Update device deployment reference
      device.deployment = toDeploymentId;
      await device.save();

      return res.status(200).json({ message: 'Device moved successfully', toDeploymentId });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);


module.exports = router;
