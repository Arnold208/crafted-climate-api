// routes/api/devices/devicesRoutes.js
const express = require('express');
const axios = require('axios');
const path = require('path');
const dotenv = require('dotenv');

const addDevice = require('../../../model/devices/addDevice');
const registerNewDevice = require('../../../model/devices/registerDevice');
const SensorModel = require('../../../model/devices/deviceModels');
const User = require('../../../model/user/userModel');
const Deployment = require('../../../model/deployment/deploymentModel');
const UserSubscription = require('../../../model/subscriptions/UserSubscription');
const Organization = require('../../../model/organization/organizationModel');
const OrgMember = require('../../../model/organization/OrgMember');
 
const enforceDeviceLimit = require('../../../middleware/subscriptions/enforceDeviceLimit');
const checkFeatureAccess = require('../../../middleware/subscriptions/checkFeatureAccess');
const authenticateToken = require('../../../middleware/user/bearermiddleware');
const { sendEmail } = require('../../../config/mail/nodemailer');

const router = express.Router();

let envFile;
if (process.env.NODE_ENV === 'development') {
  envFile = '.env.development';
} else {
  envFile = '.env';
}
dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });

const AZURE_KEY = process.env.AZURE_MAPS_SUBSCRIPTION_KEY || process.env.AZURE_MAPS_KEY;

/* ------------------------------------------------------------------------- */
/*  RBAC / ORG HELPERS                                                       */
/* ------------------------------------------------------------------------- */

/**
 * Check if a user is org owner or admin for the device's org.
 * Device must have orgid set.
 */
async function isOrgOwnerOrAdminForDevice(userid, device) {
  if (!device.orgid) return false;

  // 1) Check org owner
  const org = await Organization.findOne({ orgid: device.orgid }).lean();
  if (!org) return false;
  if (org.ownerUserid === userid) return true;

  // 2) Check OrgMember role
  const membership = await OrgMember.findOne({ orgid: device.orgid, userid }).lean();
  if (!membership) return false;
  return membership.role === 'owner' || membership.role === 'admin';
}

/**
 * Can user DELETE device?
 * - personal owner
 * - org owner/admin (for org devices)
 * - superadmin (platform)
 */
async function canDeleteDevice(user, device) {
  if (!user || !device) return false;
  if (user.role === 'superadmin') return true;
  if (device.userid === user.userid) return true;
  return isOrgOwnerOrAdminForDevice(user.userid, device);
}

/**
 * Can user UPDATE device (nickname/location/availability)?
 * - personal owner
 * - org owner/admin (for org devices)
 * - device collaborator with explicit "update" permission or role 'admin'
 * - superadmin
 */
async function canUpdateDevice(user, device) {
  if (!user || !device) return false;
  if (user.role === 'superadmin') return true;
  if (device.userid === user.userid) return true;

  // org owner/admin
  if (await isOrgOwnerOrAdminForDevice(user.userid, device)) return true;

  // collaborator with permission
  const collab = device.collaborators?.find(c => c.userid === user.userid);
  if (!collab) return false;
  if (collab.role === 'admin') return true;
  return collab.permissions?.includes('update');
}

/**
 * Can user VIEW location of device?
 * - personal owner
 * - org owner/admin
 * - superadmin
 * (we keep location more sensitive → collaborators don't automatically see location)
 */
async function canViewDeviceLocation(user, device) {
  if (!user || !device) return false;
  if (user.role === 'superadmin') return true;
  if (device.userid === user.userid) return true;
  return isOrgOwnerOrAdminForDevice(user.userid, device);
}

/* ------------------------------------------------------------------------- */
/*  ROUTES                                                                   */
/* ------------------------------------------------------------------------- */

/**
 * @swagger
 * /api/devices/register-device:
 *   post:
 *     summary: Register a new device (personal by default)
 *     description: >
 *       Registers a device **as a personal device** for the authenticated user.
 *       Devices always start as personal; moving to an organization is done via a separate endpoint.
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [auid, serial, location, nickname]
 *             properties:
 *               auid:
 *                 type: string
 *                 example: "AU-001-CCENV-01"
 *               serial:
 *                 type: string
 *                 example: "SN123456789"
 *               location:
 *                 type: array
 *                 items:
 *                   type: number
 *                 example: [5.5605, -0.2057]
 *               nickname:
 *                 type: string
 *                 example: "Lab Sensor"
 *     responses:
 *       201:
 *         description: Device registered successfully.
 *       400:
 *         description: Bad request.
 *       404:
 *         description: Device not found in manufacturing records.
 *       409:
 *         description: Device already registered.
 *       500:
 *         description: Server error.
 */
router.post('/register-device', authenticateToken, async (req, res) => {
  const { auid, serial, location, nickname } = req.body;
  const userid = req.user.userid; // always from token

  try {
    // Enforce subscription device limit
    await enforceDeviceLimit(userid);

    // Check if already registered
    const existing = await registerNewDevice.findOne({ serial });
    if (existing) {
      const message =
        existing.userid === userid
          ? 'Device is already registered to this user.'
          : 'Device is already registered by another user.';
      return res.status(409).json({ message });
    }

    // Check manufacturing record
    const manufactured = await addDevice.findOne({ serial });
    if (!manufactured) {
      return res.status(404).json({ message: 'Device not found in manufacturing records.' });
    }

    if (!Array.isArray(location) || location.length !== 2) {
      return res.status(400).json({ message: 'location must be [latitude, longitude].' });
    }

    const [latitude, longitude] = location;

    // Reverse geocode
    const geoRes = await axios.get('https://atlas.microsoft.com/search/address/reverse/json', {
      params: {
        'api-version': '1.0',
        'subscription-key': AZURE_KEY,
        query: `${latitude},${longitude}`
      }
    });

    const address = geoRes?.data?.addresses?.[0]?.address || {};
    const locationInfo = {
      country: address.country,
      region: address.countrySubdivision,
      city: address.municipality,
      postalCode: address.postalCode,
      street: address.street,
      municipality: address.municipality,
      municipalitySubdivision: address.municipalitySubdivision,
      latitude,
      longitude
    };

    // Model image
    const modelEntry = await SensorModel.findOne({
      model: manufactured.model.toLowerCase()
    });
    const imageUrl = modelEntry?.imageUrl || process.env.DEFAULT_IMAGE_URL;

    const newDevice = new registerNewDevice({
      auid,
      serial,
      devid: manufactured.devid,
      mac: manufactured.mac,
      model: manufactured.model,
      type: manufactured.type,
      datapoints: manufactured.datapoints,
      userid,
      // orgid: null by default → personal device
      nickname,
      location: JSON.stringify(locationInfo),
      battery: 100,
      subscription: [],
      image: imageUrl,
      status: 'offline',
      availability: 'private',
      manufacturingId: manufactured.manufacturingId
    });

    await newDevice.save();
    console.log('Device registered:', newDevice.auid);

    // Increment usage.devicesCount for personal subscription
    await UserSubscription.updateOne(
      { userid },
      { $inc: { 'usage.devicesCount': 1 } }
    );

    return res.status(201).json(newDevice);
  } catch (error) {
    console.error('Error registering device:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/devices/user/{userid}/registered-devices:
 *   get:
 *     tags: [Devices]
 *     summary: Get all devices the user can access
 *     description: >
 *       Returns:
 *       - devices **owned** by the user,
 *       - devices where the user is a **collaborator**,
 *       - devices inside orgs where the user is a member (owner/admin/member/viewer).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: userid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully retrieved devices.
 *       403:
 *         description: Forbidden.
 *       500:
 *         description: Error retrieving devices.
 */
router.get('/user/:userid/registered-devices', authenticateToken, async (req, res) => {
  const { userid } = req.params;

  if (req.user.userid !== userid && req.user.role !== 'superadmin') {
    return res.status(403).json({ message: 'Forbidden.' });
  }

  try {
    // 1) Owned devices
    const ownedDevices = await registerNewDevice.find({ userid }).lean();
    const byAuid = new Map();
    ownedDevices.forEach(d => byAuid.set(d.auid, { ...d, shared: false, scope: 'personal_owner' }));

    // 2) Collaborator devices
    const collaboratorDevices = await registerNewDevice
      .find({ 'collaborators.userid': userid })
      .lean();
    collaboratorDevices.forEach(d => {
      if (!byAuid.has(d.auid)) {
        byAuid.set(d.auid, { ...d, shared: true, scope: 'collaborator' });
      }
    });

    // 3) Org devices (any org where user is member)
    const memberships = await OrgMember.find({ userid }).lean();
    const orgIds = memberships.map(m => m.orgid);
    if (orgIds.length > 0) {
      const orgDevices = await registerNewDevice.find({ orgid: { $in: orgIds } }).lean();
      orgDevices.forEach(d => {
        if (!byAuid.has(d.auid)) {
          byAuid.set(d.auid, {
            ...d,
            shared: true,
            scope: 'org_member' // could refine per membership.role if needed
          });
        }
      });
    }

    res.status(200).json(Array.from(byAuid.values()));
  } catch (error) {
    console.error('Error retrieving devices:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/devices/find-registered-device/{auid}:
 *   get:
 *     tags: [Devices]
 *     summary: Find a registered device by AUID
 *     description: Retrieve a registered device's public details using its unique AUID.
 *     parameters:
 *       - name: auid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Registered device found and returned successfully.
 *       404:
 *         description: Registered device not found.
 *       500:
 *         description: Error finding registered device.
 */
router.get('/find-registered-device/:auid', async (req, res) => {
  const auid = req.params.auid;

  try {
    const device = await registerNewDevice.findOne({ auid }).lean();

    if (device) {
      res.status(200).json(device);
    } else {
      res.status(404).json({ message: 'Device not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/devices/delete-device/{userid}/{auid}:
 *   delete:
 *     tags: [Devices]
 *     summary: Delete a device (owner or org owner/admin)
 *     description: >
 *       Deletes a device and removes it from all deployments.
 *       Allowed:
 *       - personal owner,
 *       - org owner/admin (for org devices),
 *       - platform superadmin.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: userid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID making the request.
 *       - name: auid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The AUID of the device.
 *     responses:
 *       200:
 *         description: Device successfully deleted from all records.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Device not found.
 *       500:
 *         description: Error deleting device.
 */
router.delete('/delete-device/:userid/:auid', authenticateToken, async (req, res) => {
  const { userid, auid } = req.params;

  if (req.user.userid !== userid && req.user.role !== 'superadmin') {
    return res.status(403).json({ message: 'Forbidden.' });
  }

  try {
    const device = await registerNewDevice.findOne({ auid });
    if (!device) {
      return res.status(404).json({ message: 'Device not found in registration records' });
    }

    const canDelete = await canDeleteDevice(req.user, device);
    if (!canDelete) {
      return res.status(403).json({ message: 'You are not allowed to delete this device.' });
    }

    const { devid } = device;

    // Remove from all deployments that reference this device
    await Deployment.updateMany(
      { devices: devid },
      { $pull: { devices: devid } }
    );

    // Clear collaborators
    device.collaborators = [];
    await device.save();

    // Optionally: update subscription usage.devicesCount--
    await UserSubscription.updateOne(
      { userid: device.userid },
      { $inc: { 'usage.devicesCount': -1 } }
    );

    await registerNewDevice.deleteOne({ auid });

    console.log('Device and its associated data removed from deployments and database.');
    return res.status(200).json({ message: 'Device successfully deleted from all records' });
  } catch (error) {
    console.error('Error during device deletion:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/devices/user/{userid}/device-locations:
 *   get:
 *     tags: [Devices]
 *     summary: Get all device locations for a user (owned devices)
 *     description: Retrieve the locations, AUID, status, and battery level of all devices assigned to a specific user.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: userid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully retrieved device information.
 *       404:
 *         description: No devices found for this user.
 *       500:
 *         description: Error retrieving device information.
 */
router.get('/user/:userid/device-locations', authenticateToken, async (req, res) => {
  const { userid } = req.params;

  if (req.user.userid !== userid && req.user.role !== 'superadmin') {
    return res.status(403).json({ message: 'Forbidden.' });
  }

  try {
    const devices = await registerNewDevice.find(
      { userid },
      'auid location status battery'
    );

    if (!devices || devices.length === 0) {
      return res.status(404).json({ message: 'No devices found for this user' });
    }

    const deviceInfo = devices.map(device => ({
      auid: device.auid,
      location: device.location,
      status: device.status,
      battery: device.battery
    }));

    res.status(200).json(deviceInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/devices/user/{userid}/device/{auid}/location:
 *   get:
 *     tags: [Devices]
 *     summary: Get specific device location
 *     description: >
 *       Retrieve the location, AUID, status, and battery level of a specific device.
 *       Allowed:
 *       - personal owner,
 *       - org owner/admin,
 *       - superadmin.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: userid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: auid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully retrieved the device information.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Device not found.
 *       500:
 *         description: Error retrieving the device information.
 */
router.get(
  '/user/:userid/device/:auid/location',
  authenticateToken,
  checkFeatureAccess('location_access'),
  async (req, res) => {
    const { userid, auid } = req.params;

    if (req.user.userid !== userid && req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    try {
      const device = await registerNewDevice.findOne(
        { auid },
        'auid location status battery userid orgid collaborators'
      );
      if (!device) {
        return res.status(404).json({ message: 'Device not found' });
      }

      const allowed = await canViewDeviceLocation(req.user, device);
      if (!allowed) {
        return res.status(403).json({ message: 'Not allowed to view this device location.' });
      }

      const deviceInfo = {
        auid: device.auid,
        location: device.location,
        status: device.status,
        battery: device.battery
      };

      res.status(200).json(deviceInfo);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * @swagger
 * /api/devices/user/{userid}/device/{auid}/update:
 *   put:
 *     tags: [Devices]
 *     summary: Update nickname and/or location of a registered device
 *     description: >
 *       Allows updating nickname and/or location.
 *       Allowed:
 *       - personal owner,
 *       - org owner/admin (org device),
 *       - device collaborator with "update" permission,
 *       - superadmin.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: userid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: auid
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
 *             properties:
 *               nickname:
 *                 type: string
 *                 example: "Outdoor Sensor"
 *               location:
 *                 type: array
 *                 items:
 *                   type: number
 *                 description: [latitude, longitude]
 *                 example: [5.6467, -0.1669]
 *     responses:
 *       200:
 *         description: Device updated successfully.
 *       400:
 *         description: Invalid request format.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Device not found.
 *       500:
 *         description: Server error.
 */
router.put(
  '/user/:userid/device/:auid/update',
  authenticateToken,
  checkFeatureAccess('device_update'),
  async (req, res) => {
    const { userid, auid } = req.params;
    const { nickname, location } = req.body;

    if (req.user.userid !== userid && req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    if (!nickname && !location) {
      return res.status(400).json({
        message: 'Please provide at least one of: nickname or location.'
      });
    }

    try {
      const device = await registerNewDevice.findOne({ auid });
      if (!device) return res.status(404).json({ message: 'Device not found.' });

      const allowed = await canUpdateDevice(req.user, device);
      if (!allowed) {
        return res.status(403).json({ message: 'You are not allowed to update this device.' });
      }

      if (nickname) device.nickname = nickname;

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
        const geoRes = await axios.get(
          'https://atlas.microsoft.com/search/address/reverse/json',
          {
            params: {
              'api-version': '1.0',
              'subscription-key': AZURE_KEY,
              query: `${latitude},${longitude}`
            }
          }
        );

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
      res.status(200).json({
        message: 'Device updated successfully.',
        updatedFields: {
          ...(nickname && { nickname }),
          ...(location && { location: device.location })
        }
      });
    } catch (error) {
      console.error('Error updating device:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * @swagger
 * /api/devices/{userid}/device/{auid}/collaborators:
 *   post:
 *     tags: [Devices]
 *     summary: Add a collaborator to a device (owner only)
 *     description: >
 *       Only the **personal owner** can add collaborators via this endpoint.
 *       Org-level collaborator management can be added later via org-specific routes.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: auid
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
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *               role:
 *                 type: string
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Collaborator added.
 *       403:
 *         description: Unauthorized.
 *       404:
 *         description: Device or user not found.
 */
router.post(
  '/:userid/device/:auid/collaborators',
  authenticateToken,
  checkFeatureAccess('collaboration'),
  async (req, res) => {
    const { userid, auid } = req.params;
    const { email, role, permissions = [] } = req.body;

    if (req.user.userid !== userid && req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    try {
      const device = await registerNewDevice.findOne({ auid });
      if (!device) return res.status(404).json({ message: 'Device not found.' });

      // Collaborator management here → stick to personal owner only (for now)
      if (device.userid !== userid) {
        return res.status(403).json({ message: 'Only the personal owner can add collaborators.' });
      }

      const user = await User.findOne({ email });
      if (!user) return res.status(404).json({ message: 'Target user not found.' });

      const exists = device.collaborators.find(c => c.userid === user.userid);
      if (exists) return res.status(409).json({ message: 'Collaborator already exists.' });

      device.collaborators.push({ userid: user.userid, role, permissions });
      await device.save();

      const emailContent = `
        <p>Hi there,</p>
        <p>You’ve been added as a <strong>${role}</strong> on the device <strong>${device.nickname}</strong> in CraftedClimate.</p>
        <p>Your permissions include: ${permissions.length > 0 ? permissions.join(', ') : 'none'}.</p>
        <p><a href="https://console.craftedclimate.co" target="_blank">Access the Dashboard</a></p>
        <p>CraftedClimate Team</p>
      `;
      await sendEmail(
        user.email,
        `You've been added as a collaborator on ${device.nickname}`,
        emailContent
      );

      res.status(200).json({ message: 'Collaborator added.', collaborators: device.collaborators });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/devices/{userid}/device/{auid}/collaborators:
 *   delete:
 *     tags: [Devices]
 *     summary: Remove a collaborator from a device
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: auid
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
 *     responses:
 *       200:
 *         description: Collaborator removed.
 *       403:
 *         description: Unauthorized.
 *       404:
 *         description: Device or user not found.
 */
router.delete(
  '/:userid/device/:auid/collaborators',
  authenticateToken,
  async (req, res) => {
    const { userid, auid } = req.params;
    const { email } = req.body;

    if (req.user.userid !== userid && req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    try {
      const device = await registerNewDevice.findOne({ auid });
      if (!device) return res.status(404).json({ message: 'Device not found.' });

      if (device.userid !== userid) {
        return res.status(403).json({ message: 'Only the personal owner can remove collaborators.' });
      }

      const user = await User.findOne({ email });
      if (!user) return res.status(404).json({ message: 'Target user not found.' });

      device.collaborators = device.collaborators.filter(
        c => c.userid !== user.userid
      );
      await device.save();
      res.status(200).json({ message: 'Collaborator removed.', collaborators: device.collaborators });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/devices/{userid}/device/{auid}/collaborators/permissions:
 *   post:
 *     tags: [Devices]
 *     summary: Get role and permissions of a user on a device
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: auid
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
 *     responses:
 *       200:
 *         description: Role and permissions returned.
 *       404:
 *         description: Device or user not found.
 */
router.post(
  '/:userid/device/:auid/collaborators/permissions',
  authenticateToken,
  async (req, res) => {
    const { userid, auid } = req.params;
    const { email } = req.body;

    if (req.user.userid !== userid && req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    try {
      const device = await registerNewDevice.findOne({ auid });
      if (!device) return res.status(404).json({ message: 'Device not found.' });

      const targetUser = await User.findOne({ email });
      if (!targetUser) return res.status(404).json({ message: 'Target user not found.' });

      // Owner?
      if (device.userid === targetUser.userid) {
        return res.status(200).json({ role: 'owner', permissions: ['*'] });
      }

      const collab = device.collaborators.find(c => c.userid === targetUser.userid);
      if (!collab) {
        return res.status(404).json({ message: 'Collaborator not found on this device.' });
      }

      return res.status(200).json({ role: collab.role, permissions: collab.permissions });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/devices/{userid}/device/{auid}/collaborators/batch:
 *   post:
 *     tags: [Devices]
 *     summary: Add multiple collaborators to a single device
 *     description: Only the personal owner can batch-add collaborators.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: auid
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
 *               collaborators:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [email, role]
 *                   properties:
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
 *     responses:
 *       200:
 *         description: Collaborators added successfully
 *       403:
 *         description: Unauthorized
 *       404:
 *         description: Device or users not found
 *       500:
 *         description: Server error
 */
router.post(
  '/:userid/device/:auid/collaborators/batch',
  authenticateToken,
  async (req, res) => {
    const { userid, auid } = req.params;
    const { collaborators } = req.body;

    if (req.user.userid !== userid && req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    try {
      const device = await registerNewDevice.findOne({ auid });
      if (!device) return res.status(404).json({ message: 'Device not found.' });
      if (device.userid !== userid) {
        return res.status(403).json({ message: 'Only the personal owner can add collaborators.' });
      }

      const added = [];
      for (const collab of collaborators || []) {
        const user = await User.findOne({ email: collab.email });
        if (user && !device.collaborators.find(c => c.userid === user.userid)) {
          device.collaborators.push({
            userid: user.userid,
            role: collab.role,
            permissions: collab.permissions || []
          });
          added.push(collab.email);

          const emailContent = `
            <p>Hi there,</p>
            <p>You’ve been added as a <strong>${collab.role}</strong> on the device <strong>${device.nickname}</strong> in CraftedClimate.</p>
            <p>Your permissions include: ${collab.permissions?.length ? collab.permissions.join(', ') : 'none'}.</p>
            <p><a href="https://console.craftedclimate.co" target="_blank">Access the Dashboard</a></p>
            <p>CraftedClimate Team</p>
          `;
          await sendEmail(
            user.email,
            `You've been added as a collaborator on ${device.nickname}`,
            emailContent
          );
        }
      }

      await device.save();
      res.status(200).json({ message: 'Collaborators added.', added });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/devices/collaborator/{email}/devices/batch:
 *   post:
 *     tags: [Devices]
 *     summary: Assign a single collaborator to multiple devices
 *     description: >
 *       Adds one collaborator (by email) to a list of devices.
 *       Only the **owners of those devices** should be allowed to trigger this from the UI.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: email
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
 *               devices:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [auid, role]
 *                   properties:
 *                     auid:
 *                       type: string
 *                     role:
 *                       type: string
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
 *     responses:
 *       200:
 *         description: Collaborator added to devices successfully
 *       404:
 *         description: User or devices not found
 *       500:
 *         description: Server error
 */
router.post(
  '/collaborator/:email/devices/batch',
  authenticateToken,
  async (req, res) => {
    const { email } = req.params;
    const { devices } = req.body;

    try {
      const user = await User.findOne({ email });
      if (!user) return res.status(404).json({ message: 'Collaborator user not found.' });

      const added = [];
      for (const item of devices || []) {
        const device = await registerNewDevice.findOne({ auid: item.auid });
        if (!device) continue;

        // Only allow if current user is owner or superadmin
        if (device.userid !== req.user.userid && req.user.role !== 'superadmin') {
          continue;
        }

        if (
          device.userid !== user.userid &&
          !device.collaborators.find(c => c.userid === user.userid)
        ) {
          device.collaborators.push({
            userid: user.userid,
            role: item.role,
            permissions: item.permissions || []
          });
          await device.save();
          added.push(item.auid);

          const emailContent = `
            <p>Hi there,</p>
            <p>You’ve been added as a <strong>${item.role}</strong> on the device <strong>${device.nickname}</strong> in CraftedClimate.</p>
            <p>Your permissions include: ${item.permissions?.length ? item.permissions.join(', ') : 'none'}.</p>
            <p><a href="https://console.craftedclimate.co" target="_blank">Access the Dashboard</a></p>
            <p>CraftedClimate Team</p>
          `;
          await sendEmail(
            user.email,
            `You've been added as a collaborator on ${device.nickname}`,
            emailContent
          );
        }
      }

      res.status(200).json({ message: 'Collaborator added to devices.', added });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/devices/user/{userid}/device/{auid}/availability:
 *   put:
 *     tags: [Devices]
 *     summary: Update device availability
 *     description: >
 *       Allows changing availability ("public" / "private").
 *       Allowed:
 *       - personal owner,
 *       - org owner/admin (for org devices),
 *       - superadmin.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: auid
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
 *               - availability
 *             properties:
 *               availability:
 *                 type: string
 *                 enum: [public, private]
 *     responses:
 *       200:
 *         description: Availability updated successfully.
 *       400:
 *         description: Invalid availability value.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Device not found.
 *       500:
 *         description: Server error.
 */
router.put(
  '/user/:userid/device/:auid/availability',
  authenticateToken,
  checkFeatureAccess('public_listing'),
  async (req, res) => {
    const { userid, auid } = req.params;
    const { availability } = req.body;

    if (req.user.userid !== userid && req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    if (!['public', 'private'].includes(availability)) {
      return res.status(400).json({
        message: 'Availability must be either "public" or "private".'
      });
    }

    try {
      const device = await registerNewDevice.findOne({ auid });
      if (!device) {
        return res.status(404).json({ message: 'Device not found.' });
      }

      const allowed = await canUpdateDevice(req.user, device);
      if (!allowed) {
        return res.status(403).json({ message: 'You are not allowed to change availability.' });
      }

      device.availability = availability;
      await device.save();

      return res.status(200).json({
        message: `Device availability set to ${availability}.`,
        device
      });
    } catch (err) {
      console.error('Error updating device availability:', err);
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/devices/{userid}/device/{auid}/clear-collaborators:
 *   post:
 *     tags: [Devices]
 *     summary: Clear all personal collaborators from a device
 *     description: >
 *       Removes all entries in the collaborators array for this device.
 *       Only the personal owner or a superadmin can perform this action.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: auid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: All collaborators cleared.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Device not found.
 *       500:
 *         description: Server error.
 */
router.post(
  '/:userid/device/:auid/clear-collaborators',
  authenticateToken,
  async (req, res) => {
    const { userid, auid } = req.params;

    if (req.user.userid !== userid && req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    try {
      const device = await registerNewDevice.findOne({ auid });
      if (!device) {
        return res.status(404).json({ message: 'Device not found.' });
      }

      if (device.userid !== userid && req.user.role !== 'superadmin') {
        return res.status(403).json({
          message: 'Only the personal owner or superadmin can clear collaborators.'
        });
      }

      device.collaborators = [];
      await device.save();

      return res.status(200).json({
        message: 'All collaborators cleared from this device.',
        collaborators: device.collaborators
      });
    } catch (err) {
      console.error('Error clearing collaborators:', err);
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/devices/{userid}/device/{auid}/transfer-to-org:
 *   post:
 *     tags: [Devices]
 *     summary: Transfer a personal device into an organization
 *     description: >
 *       Transfers a device owned by a user into an organization.
 *       Only the personal owner or a superadmin can perform this action.
 *       When transferred, all personal collaborators are cleared (Option A).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: auid
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
 *               - orgid
 *             properties:
 *               orgid:
 *                 type: string
 *                 description: ID of the target organization
 *     responses:
 *       200:
 *         description: Device transferred into org successfully.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Device or organization not found.
 *       500:
 *         description: Server error.
 */
router.post(
  '/:userid/device/:auid/transfer-to-org',
  authenticateToken,
  async (req, res) => {
    const { userid, auid } = req.params;
    const { orgid } = req.body;

    if (req.user.userid !== userid && req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    try {
      const device = await registerNewDevice.findOne({ auid });
      if (!device) {
        return res.status(404).json({ message: 'Device not found.' });
      }

      if (device.userid !== userid && req.user.role !== 'superadmin') {
        return res.status(403).json({
          message: 'Only the personal owner or superadmin can transfer this device to an org.'
        });
      }

      const org = await Organization.findOne({ orgid });
      if (!org) {
        return res.status(404).json({ message: 'Organization not found.' });
      }

      // Option A — when moving into org, clear all collaborators
      device.orgid = orgid;
      device.collaborators = [];
      await device.save();

      return res.status(200).json({
        message: 'Device successfully transferred to organization.',
        device
      });
    } catch (err) {
      console.error('Error transferring device to org:', err);
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/devices/org/{orgid}/device/{auid}/transfer-to-user:
 *   post:
 *     tags: [Devices]
 *     summary: Transfer a device out of an organization back to its personal owner
 *     description: >
 *       Removes org association from the device and returns it to pure personal ownership.
 *       Only the device's personal owner or a superadmin can perform this action.
 *       When transferred, all collaborators are cleared (Option A).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgid
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: auid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Device transferred back to user successfully.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Device not found.
 *       500:
 *         description: Server error.
 */
router.post(
  '/org/:orgid/device/:auid/transfer-to-user',
  authenticateToken,
  async (req, res) => {
    const { orgid, auid } = req.params;

    try {
      const device = await registerNewDevice.findOne({ auid });
      if (!device) {
        return res.status(404).json({ message: 'Device not found.' });
      }

      if (device.orgid !== orgid) {
        return res.status(403).json({ message: 'Device does not belong to this organization.' });
      }

      if (req.user.role !== 'superadmin' && req.user.userid !== device.userid) {
        return res.status(403).json({
          message: 'Only the personal owner or superadmin can transfer the device out of the org.'
        });
      }

      // Remove org association and clear collaborators (Option A)
      device.orgid = null;
      device.collaborators = [];
      await device.save();

      return res.status(200).json({
        message: 'Device transferred back to personal ownership. Collaborators cleared.',
        device
      });
    } catch (err) {
      console.error('Error transferring device to user:', err);
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/devices/org/{orgid}/list:
 *   get:
 *     tags: [Devices]
 *     summary: List devices assigned to an organization
 *     description: >
 *       Returns all devices where orgid matches the provided organization.
 *       Currently restricted to superadmin (you can extend this to org owners/admins).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of org devices.
 *       403:
 *         description: Forbidden.
 *       500:
 *         description: Server error.
 */
router.get(
  '/org/:orgid/list',
  authenticateToken,
  async (req, res) => {
    const { orgid } = req.params;

    if (req.user.role !== 'superadmin') {
      // TODO: extend authorization to org owners/admins once org role helpers are available
      return res.status(403).json({ message: 'Forbidden.' });
    }

    try {
      const devices = await registerNewDevice.find({ orgid });
      return res.status(200).json({ devices });
    } catch (err) {
      console.error('Error listing org devices:', err);
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/devices/search:
 *   get:
 *     tags: [Devices]
 *     summary: Search devices
 *     description: >
 *       Search for devices by nickname, model, or AUID.
 *       This endpoint can be used for global device search within the console.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search term (nickname, model, auid, etc.)
 *     responses:
 *       200:
 *         description: Devices matching the search query.
 *       400:
 *         description: Missing or invalid query.
 *       500:
 *         description: Server error.
 */
router.get(
  '/search',
  authenticateToken,
  async (req, res) => {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ message: 'Query parameter "q" is required.' });
    }

    try {
      const regex = new RegExp(q, 'i');
      const devices = await registerNewDevice.find({
        $or: [
          { nickname: regex },
          { model: regex },
          { auid: regex }
        ]
      });

      return res.status(200).json({ devices });
    } catch (err) {
      console.error('Error searching devices:', err);
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/devices/{userid}/device/{auid}/access:
 *   get:
 *     tags: [Devices]
 *     summary: Get the authenticated user's access level for a device
 *     description: >
 *       Returns the role and permissions of the currently authenticated user
 *       on a specific device (owner, collaborator, or none).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: auid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Access information returned.
 *       404:
 *         description: Device not found or no access.
 *       500:
 *         description: Server error.
 */
router.get(
  '/:userid/device/:auid/access',
  authenticateToken,
  async (req, res) => {
    const { userid, auid } = req.params;

    // Ensure token user matches path user or is superadmin
    if (req.user.userid !== userid && req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    try {
      const device = await registerNewDevice.findOne({ auid });
      if (!device) {
        return res.status(404).json({ message: 'Device not found.' });
      }

      // Owner
      if (device.userid === req.user.userid || req.user.role === 'superadmin') {
        return res.status(200).json({
          role: device.userid === req.user.userid ? 'owner' : 'superadmin',
          permissions: ['*']
        });
      }

      // Collaborator
      const collab = device.collaborators.find(c => c.userid === req.user.userid);
      if (collab) {
        return res.status(200).json({
          role: collab.role,
          permissions: collab.permissions || []
        });
      }

      // No explicit access (you can later add org-level fallback here)
      return res.status(404).json({ message: 'No access to this device for current user.' });
    } catch (err) {
      console.error('Error getting device access:', err);
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/devices/org/{orgid}/device/{auid}/permissions:
 *   put:
 *     tags: [Devices]
 *     summary: Set org-level permissions for a device
 *     description: >
 *       Updates organization-level permissions associated with a device.
 *       Currently restricted to superadmin; you can extend to org owners/admins.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgid
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: auid
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
 *               - permissions
 *             properties:
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Org permissions updated.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Device not found.
 *       500:
 *         description: Server error.
 */
router.put(
  '/org/:orgid/device/:auid/permissions',
  authenticateToken,
  async (req, res) => {
    const { orgid, auid } = req.params;
    const { permissions } = req.body;

    if (!Array.isArray(permissions)) {
      return res.status(400).json({ message: '"permissions" must be an array of strings.' });
    }

    if (req.user.role !== 'superadmin') {
      // TODO: extend authorization to org owners/admins once org role helpers are available.
      return res.status(403).json({ message: 'Forbidden.' });
    }

    try {
      const device = await registerNewDevice.findOne({ auid });
      if (!device) {
        return res.status(404).json({ message: 'Device not found.' });
      }

      if (device.orgid !== orgid) {
        return res.status(403).json({ message: 'Device does not belong to this organization.' });
      }

      device.orgPermissions = permissions;
      await device.save();

      return res.status(200).json({
        message: 'Org-level device permissions updated.',
        orgid,
        device
      });
    } catch (err) {
      console.error('Error updating org-level permissions:', err);
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/devices/org/{orgid}/device/{auid}:
 *   delete:
 *     tags: [Devices]
 *     summary: Remove a device from an organization
 *     description: >
 *       Detaches a device from an organization (orgid is set to null) and clears all collaborators (Option A).
 *       Only superadmin or the personal owner can perform this action.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgid
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: auid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Device removed from organization.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Device not found.
 *       500:
 *         description: Server error.
 */
router.delete(
  '/org/:orgid/device/:auid',
  authenticateToken,
  async (req, res) => {
    const { orgid, auid } = req.params;

    try {
      const device = await registerNewDevice.findOne({ auid });
      if (!device) {
        return res.status(404).json({ message: 'Device not found.' });
      }

      if (device.orgid !== orgid) {
        return res.status(403).json({ message: 'Device does not belong to this organization.' });
      }

      if (req.user.role !== 'superadmin' && req.user.userid !== device.userid) {
        return res.status(403).json({
          message: 'Only the personal owner or superadmin can detach the device from the org.'
        });
      }

      device.orgid = null;
      device.orgPermissions = [];
      device.collaborators = []; // Option A — clear all collaborators
      await device.save();

      return res.status(200).json({
        message: 'Device removed from organization and collaborators cleared.',
        device
      });
    } catch (err) {
      console.error('Error removing device from org:', err);
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);


module.exports = router;
