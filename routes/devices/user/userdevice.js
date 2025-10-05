const express = require('express');
const axios = require('axios');
const addDevice = require('../../../model/devices/addDevice')
const registerNewDevice = require('../../../model/devices/registerDevice')
const SensorModel= require('../../../model/devices/deviceModels')
const User = require('../../../model/user/userModel');
const Deployment = require('../../../model/deployment/deploymentModel');
const { sendEmail } = require('../../../config/mail/nodemailer');

// const CardSubscription = require("../../model/subscriptions/cardSubscription");
// const authenticateToken = require('../../middleware/apiKeymiddleware');
// const AllowedModel = require("../../model/sensor_image/allowedModels");
// const SensorImages = require("../../model/sensor_image/sensor_image");

const router = express.Router();
const dotenv = require('dotenv');
const path = require('path');

let envFile;

if (process.env.NODE_ENV === 'development') {
  envFile = '.env.development';
} else {
  envFile = '.env';   // default for production or if NODE_ENV not set
}

dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });


const AZURE_KEY = process.env.AZURE_MAPS_SUBSCRIPTION_KEY;

/**
 * @swagger
 * /api/devices/register-device:
 *   post:
 *     summary: Register a new device
 *     tags: [Devices]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [auid, serial, location, userid, nickname]
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
 *               userid:
 *                 type: string
 *                 example: "user-123"
 *               nickname:
 *                 type: string
 *                 example: "Lab Sensor"
 *     responses:
 *       201:
 *         description: Device registered successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Device not found
 */
router.post('/register-device', async (req, res) => {
  const { auid, serial, location, userid, nickname } = req.body;

  try {
    // Check if already registered
    const existing = await registerNewDevice.findOne({ serial });
    if (existing) {
      const message = existing.userid === userid
        ? 'Device is already registered to this user.'
        : 'Device is already registered.';
      return res.status(409).json({ message });
    }

    // Find in manufacturing database
    const manufactured = await addDevice.findOne({ serial });
    if (!manufactured) {
      return res.status(404).json({ message: 'Device not found in manufacturing records.' });
    }

    const [latitude, longitude] = location;

    // Get reverse geolocation
    const geoRes = await axios.get(`https://atlas.microsoft.com/search/address/reverse/json`, {
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

    // Get image from SensorModel
    const modelEntry = await SensorModel.findOne({ model: manufactured.model.toLowerCase() });
    const imageUrl = modelEntry?.imageUrl || process.env.DEFAULT_IMAGE_URL;

    // Construct registration object
    const newDevice = new registerNewDevice({
      auid,
      serial,
      devid: manufactured.devid,
      mac: manufactured.mac,
      model: manufactured.model,
      type: manufactured.type,
      datapoints: manufactured.datapoints,
      userid,
      nickname,
      location: JSON.stringify(locationInfo),
      battery: 100,
      subscription: [], // can be added later
      image: imageUrl,
      status: 'offline',
      availability: 'private',
      manufacturingId: manufactured.manufacturingId
    });

    await newDevice.save();
    console.log('Device registered:', newDevice);
    res.status(201).json(newDevice);

  } catch (error) {
    console.error('Error registering device:', error);
    res.status(500).json({ error: error.message });
  }
});


// /**
//  * @swagger
//  * /api/devices/all-registered-devices:
//  *   get:
//  *     tags:
//  *       - Devices
//  *     summary: Get all registered devices
//  *     description: Retrieve a list of all registered devices.
//  *     responses:
//  *       200:
//  *         description: Successfully retrieved all registered devices.
//  *       404:
//  *         description: No devices found.
//  *       500:
//  *         description: Error retrieving registered devices.
//  */


// router.get('/all-registered-devices', async (req, res) => {
//   try {
//     const devices = await registerNewDevice.find();

//     if (devices && devices.length > 0) {
//       res.json(devices);
//     } else {
//       res.status(404).json({ message: 'No devices found' });
//     }
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });


/**
 * @swagger
 * /api/devices/user/{userid}/registered-devices:
 *   get:
 *     tags:
 *       - Devices
 *     summary: Get all registered and shared devices of a user
 *     description: Retrieve all devices registered by a user and devices shared with them as a collaborator.
 *     parameters:
 *       - name: userid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully retrieved devices.
 *       500:
 *         description: Error retrieving devices.
 */
router.get('/user/:userid/registered-devices', async (req, res) => {
  const { userid } = req.params;

  try {
    const ownedDevices = await registerNewDevice.find({ userid });
    const ownedDeviceDevids = new Set(ownedDevices.map(d => d.devid));

    const collaboratorDevices = await registerNewDevice.find({ 'collaborators.userid': userid });
    const filteredSharedDevices = collaboratorDevices.filter(d => !ownedDeviceDevids.has(d.devid));

    const sharedDevicesWithFlag = filteredSharedDevices.map(device => {
      return { ...device.toObject(), shared: true };
    });

    const allDevices = [
      ...ownedDevices.map(d => ({ ...d.toObject(), shared: false })),
      ...sharedDevicesWithFlag
    ];

    res.status(200).json(allDevices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/devices/find-registered-device/{auid}:
 *   get:
 *     tags:
 *       - Devices
 *     summary: Find a registered device by AUID
 *     description: Retrieve a registered device's details using its unique AUID.
 *     parameters:
 *       - name: auid
 *         in: path
 *         required: true
 *         type: string
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
    const device = await registerNewDevice.findOne({ auid: auid });

    if (device) {
      res.status(200).json(device);
    } else {
      res.status(404).json({ message: 'Device not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// /**
//  * @swagger
//  * /api/devices/delete-device/{auid}:
//  *   delete:
//  *     tags:
//  *       - Devices
//  *     summary: Delete a device
//  *     description: Deletes a device from the system using its AUID. Also removes the device from any deployments and clears its collaborators before deletion.
//  *     parameters:
//  *       - name: auid
//  *         in: path
//  *         required: true
//  *         type: string
//  *     responses:
//  *       200:
//  *         description: Device successfully deleted from all records.
//  *       404:
//  *         description: Device not found in registration records.
//  *       500:
//  *         description: Error deleting device.
//  */
// router.delete('/delete-device/:auid', async (req, res) => {
//   const { auid } = req.params;

//   try {
//     // Get the registered device
//     const device = await registerNewDevice.findOne({ auid });
//     if (!device) {
//       return res.status(404).json({ message: 'Device not found in registration records' });
//     }

//     const { devid } = device;

//     // Remove this device from all deployments it's part of
//     await Deployment.updateMany(
//       { devices: devid },
//       { $pull: { devices: devid } }
//     );

//     // Clear collaborators from the device
//     device.collaborators = [];
//     await device.save();

//     // Delete from addDevice collection (if applicable)
//     // await addDevice.findOneAndDelete({ devid });

//     // Delete from registerNewDevice collection
//     await registerNewDevice.findOneAndDelete({ auid });

//     console.log("Device and its associated data removed from deployments and database.");
//     return res.status(200).json({ message: 'Device successfully deleted from all records' });
//   } catch (error) {
//     console.error("Error during device deletion:", error);
//     return res.status(500).json({ error: error.message });
//   }
// });

/**
 * @swagger
 * /api/devices/delete-device/{userid}/{auid}:
 *   delete:
 *     tags:
 *       - Devices
 *     summary: Delete a device (owner only)
 *     description: Deletes a device from the system using the owner's user ID and device AUID. Also removes the device from any deployments and clears its collaborators before deletion.
 *     parameters:
 *       - name: userid
 *         in: path
 *         required: true
 *         type: string
 *         description: The user ID of the owner of the device.
 *       - name: auid
 *         in: path
 *         required: true
 *         type: string
 *         description: The AUID of the device.
 *     responses:
 *       200:
 *         description: Device successfully deleted from all records.
 *       403:
 *         description: Forbidden — user is not the owner.
 *       404:
 *         description: Device not found in registration records.
 *       500:
 *         description: Error deleting device.
 */
router.delete('/delete-device/:userid/:auid', async (req, res) => {
  const { userid, auid } = req.params;

  try {
    // Get the registered device by AUID
    const device = await registerNewDevice.findOne({ auid });
    if (!device) {
      return res.status(404).json({ message: 'Device not found in registration records' });
    }

    // Ensure the requester is the owner of the device
    // device.userid may be ObjectId or string -> normalize to string
    if (device.userid.toString() !== userid.toString()) {
      return res.status(403).json({ message: 'Forbidden: only the device owner can delete this device.' });
    }

    const { devid } = device;

    // Remove this device from all deployments it's part of
    await Deployment.updateMany(
      { devices: devid },
      { $pull: { devices: devid } }
    );

    // Clear collaborators from the device
    device.collaborators = [];
    await device.save();

    // Optionally delete from manufacturing/addDevice collection if desired
    // await addDevice.findOneAndDelete({ devid });

    // Delete from registerNewDevice collection
    await registerNewDevice.findOneAndDelete({ auid });

    console.log("Device and its associated data removed from deployments and database.");
    return res.status(200).json({ message: 'Device successfully deleted from all records' });
  } catch (error) {
    console.error("Error during device deletion:", error);
    return res.status(500).json({ error: error.message });
  }
});


/**
 * @swagger
 * /api/devices/user/{userid}/device-locations:
 *   get:
 *     tags:
 *       - Devices
 *     summary: Get all device locations for a user
 *     description: Retrieve the locations, AUID, status, and battery level of all devices assigned to a specific user.
 *     parameters:
 *       - name: userid
 *         in: path
 *         required: true
 *         type: string
 *         description: The user ID whose device locations are to be retrieved.
 *     responses:
 *       200:
 *         description: Successfully retrieved device information.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   auid:
 *                     type: string
 *                     description: Unique identifier of the device.
 *                   location:
 *                     type: string
 *                     description: Location of the device (usually a JSON string).
 *                   status:
 *                     type: string
 *                     description: Current status of the device.
 *                   battery:
 *                     type: number
 *                     description: Battery level of the device.
 *       404:
 *         description: No devices found for this user.
 *       500:
 *         description: Error retrieving device information.
 */
router.get('/user/:userid/device-locations', async (req, res) => {
  const userid = req.params.userid;

  try {
    // Find all devices for the given userid and select specific fields
    const devices = await registerNewDevice.find({ userid: userid }, 'auid location status battery');

    if (!devices || devices.length === 0) {
      return res.status(404).json({ message: 'No devices found for this user' });
    }

    // Format the response to include auid, location, status, and battery
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
 *     tags:
 *       - Devices
 *     summary: Get specific device location for a user
 *     description: Retrieve the location, AUID, status, and battery level of a specific device assigned to a user using their user ID and the device AUID.
 *     parameters:
 *       - name: userid
 *         in: path
 *         required: true
 *         type: string
 *         description: The user ID whose device location is to be retrieved.
 *       - name: auid
 *         in: path
 *         required: true
 *         type: string
 *         description: The AUID of the device.
 *     responses:
 *       200:
 *         description: Successfully retrieved the device information.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 auid:
 *                   type: string
 *                   description: Unique identifier of the device.
 *                 location:
 *                   type: string
 *                   description: Location of the device (usually a JSON string).
 *                 status:
 *                   type: string
 *                   description: Current status of the device.
 *                 battery:
 *                   type: number
 *                   description: Battery level of the device.
 *       404:
 *         description: Device not found.
 *       500:
 *         description: Error retrieving the device information.
 */
router.get('/user/:userid/device/:auid/location', async (req, res) => {
  const { userid, auid } = req.params;

  try {
    // Find the specific device by userid and auid
    const device = await registerNewDevice.findOne({ userid: userid, auid: auid }, 'auid location status battery');

    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    // Format the response to include auid, location, status, and battery
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
});

/**
 * @swagger
 * /api/devices/user/{userid}/device/{auid}/update:
 *   put:
 *     tags:
 *       - Devices
 *     summary: Update nickname and/or location of a registered device
 *     description: Allows updating the nickname and/or location of a device using the user ID and device AUID.
 *     parameters:
 *       - name: userid
 *         in: path
 *         required: true
 *         type: string
 *         description: User ID associated with the device.
 *       - name: auid
 *         in: path
 *         required: true
 *         type: string
 *         description: AUID of the device.
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
 *                 description: An array of [latitude, longitude].
 *                 example: [5.6467, -0.1669]
 *     responses:
 *       200:
 *         description: Device updated successfully.
 *       400:
 *         description: Invalid request format.
 *       404:
 *         description: Device not found.
 *       500:
 *         description: Server error while updating device.
 */
router.put('/user/:userid/device/:auid/update', async (req, res) => {
  const { userid, auid } = req.params;
  const { nickname, location } = req.body;

  if (!nickname && !location) {
    return res.status(400).json({
      message: 'Please provide at least one of: nickname or location.'
    });
  }

  try {
    const device = await registerNewDevice.findOne({ userid, auid });
    if (!device) return res.status(404).json({ message: 'Device not found.' });

    if (nickname) device.nickname = nickname;

    if (location) {
      if (!Array.isArray(location) || location.length !== 2 ||
          typeof location[0] !== 'number' || typeof location[1] !== 'number') {
        return res.status(400).json({ message: 'Invalid location format. Must be [latitude, longitude]' });
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
});

 
/**
 * @swagger
 * /api/devices/{userid}/device/{auid}/collaborators:
 *   post:
 *     tags: [Devices]
 *     summary: Add a collaborator to a device
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user who owns the device.
 *       - in: path
 *         name: auid
 *         required: true
 *         schema:
 *           type: string
 *         description: The AUID of the device.
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
router.post('/:userid/device/:auid/collaborators', async (req, res) => {
  const { userid, auid } = req.params;
  const { email, role, permissions = [] } = req.body;

  try {
    const device = await registerNewDevice.findOne({ auid });
    if (!device) return res.status(404).json({ message: 'Device not found.' });
    if (device.userid !== userid) return res.status(403).json({ message: 'Only the owner can add collaborators.' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'Target user not found.' });

    const exists = device.collaborators.find(c => c.userid === user.userid.toString());
    if (exists) return res.status(409).json({ message: 'Collaborator already exists.' });

    device.collaborators.push({ userid: user.userid.toString(), role, permissions });
    await device.save();

    // Send email notification
    const emailContent = `
      <p>Hi there,</p>
      <p>You’ve been added as a <strong>${role}</strong> on the device <strong>${device.nickname}</strong> in CraftedClimate.</p>
      <p>Your permissions include: ${permissions.length > 0 ? permissions.join(', ') : 'none'}.</p>
      <p><a href="https://console.craftedclimate.co" target="_blank">Access the Dashboard</a></p>
      <p>CraftedClimate Team</p>
    `;
    await sendEmail(user.email, `You've been added as a collaborator on ${device.nickname}`, emailContent);

    res.status(200).json({ message: 'Collaborator added.', collaborators: device.collaborators });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/devices/{userid}/device/{auid}/collaborators:
 *   delete:
 *     tags: [Devices]
 *     summary: Remove a collaborator from a device
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user who owns the device.
 *       - in: path
 *         name: auid
 *         required: true
 *         schema:
 *           type: string
 *         description: The AUID of the device.
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
router.delete('/:userid/device/:auid/collaborators', async (req, res) => {
  const { userid, auid } = req.params;
  const { email } = req.body;

  try {
    const device = await registerNewDevice.findOne({ auid });
    if (!device) return res.status(404).json({ message: 'Device not found.' });
    if (device.userid !== userid) return res.status(403).json({ message: 'Only the owner can remove collaborators.' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'Target user not found.' });

    device.collaborators = device.collaborators.filter(c => c.userid !== user._id.toString());
    await device.save();
    res.status(200).json({ message: 'Collaborator removed.', collaborators: device.collaborators });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * @swagger
 * /api/devices/{userid}/device/{auid}/collaborators:
 *   delete:
 *     tags: [Devices]
 *     summary: Remove a collaborator from a device
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
router.delete('/:userid/device/:auid/collaborators', async (req, res) => {
  const { userid, auid } = req.params;
  const { email } = req.body;

  try {
    const device = await registerNewDevice.findOne({ auid });
    if (!device) return res.status(404).json({ message: 'Device not found.' });
    if (device.userid !== userid) return res.status(403).json({ message: 'Only the owner can remove collaborators.' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'Target user not found.' });

    device.collaborators = device.collaborators.filter(c => c.userid !== user._id.toString());
    await device.save();
    res.status(200).json({ message: 'Collaborator removed.', collaborators: device.collaborators });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/devices/{userid}/device/{auid}/collaborators/permissions:
 *   post:
 *     tags: [Devices]
 *     summary: Get role and permissions of a user on a device
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user who owns the device.
 *       - in: path
 *         name: auid
 *         required: true
 *         schema:
 *           type: string
 *         description: The AUID of the device.
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
router.post('/:userid/device/:auid/collaborators/permissions', async (req, res) => {
  const { userid, auid } = req.params;
  const { email } = req.body;

  try {
    const device = await registerNewDevice.findOne({ auid });
    if (!device) return res.status(404).json({ message: 'Device not found.' });

    const ownerUser = await User.findById(device.userid);
    const targetUser = await User.findOne({ email });

    if (!targetUser) return res.status(404).json({ message: 'Target user not found.' });

    if (ownerUser.email === email) {
      return res.status(200).json({ role: 'owner', permissions: ['*'] });
    }

    const collab = device.collaborators.find(c => c.userid === targetUser._id.toString());
    if (!collab) return res.status(404).json({ message: 'Collaborator not found on this device.' });

    return res.status(200).json({ role: collab.role, permissions: collab.permissions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * @swagger
 * /api/devices/{userid}/device/{auid}/collaborators/batch:
 *   post:
 *     tags: [Devices]
 *     summary: Add multiple collaborators to a single device
 *     description: Allows the owner of a device to add several collaborators at once.
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID of the device owner
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

// Batch Add Collaborators to One Device
router.post('/:userid/device/:auid/collaborators/batch', async (req, res) => {
  const { userid, auid } = req.params;
  const { collaborators } = req.body; // [{ email, role, permissions }]

  try {
    const device = await registerNewDevice.findOne({ auid });
    if (!device) return res.status(404).json({ message: 'Device not found.' });
    if (device.userid !== userid) return res.status(403).json({ message: 'Only the owner can add collaborators.' });

    const added = [];
    for (const collab of collaborators) {
      const user = await User.findOne({ email: collab.email });
      if (user && !device.collaborators.find(c => c.userid === user.userid.toString())) {
        device.collaborators.push({ userid: user.userid.toString(), role: collab.role, permissions: collab.permissions });
        added.push(collab.email);
        const emailContent = `
          <p>Hi there,</p>
          <p>You’ve been added as a <strong>${collab.role}</strong> on the device <strong>${device.nickname}</strong> in CraftedClimate.</p>
          <p>Your permissions include: ${collab.permissions.length > 0 ? collab.permissions.join(', ') : 'none'}.</p>
          <p><a href="https://console.craftedclimate.co" target="_blank">Access the Dashboard</a></p>
          <p>CraftedClimate Team</p>
        `;
        await sendEmail(user.email, `You've been added as a collaborator on ${device.nickname}`, emailContent);
      }
    }

    await device.save();
    res.status(200).json({ message: 'Collaborators added.', added });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * @swagger
 * /api/devices/collaborator/{email}/devices/batch:
 *   post:
 *     tags: [Devices]
 *     summary: Assign a single collaborator to multiple devices
 *     description: Allows adding one collaborator (by email) to a list of devices.
 *     parameters:
 *       - in: path
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *         description: Email of the user to be added as a collaborator
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

// Batch Add One Collaborator to Multiple Devices
router.post('/collaborator/:email/devices/batch', async (req, res) => {
  const { email } = req.params;
  const { devices } = req.body; // [{ auid, role, permissions }]

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const added = [];
    for (const item of devices) {
      const device = await registerNewDevice.findOne({ auid: item.auid });
      if (device && device.userid !== user.userid.toString() && !device.collaborators.find(c => c.userid === user.userid.toString())) {
        device.collaborators.push({ userid: user.userid.toString(), role: item.role, permissions: item.permissions });
        await device.save();
        added.push(item.auid);

        const emailContent = `
          <p>Hi there,</p>
          <p>You’ve been added as a <strong>${item.role}</strong> on the device <strong>${device.nickname}</strong> in CraftedClimate.</p>
          <p>Your permissions include: ${item.permissions.length > 0 ? item.permissions.join(', ') : 'none'}.</p>
          <p><a href="https://console.craftedclimate.co" target="_blank">Access the Dashboard</a></p>
          <p>CraftedClimate Team</p>
        `;
        await sendEmail(user.email, `You've been added as a collaborator on ${device.nickname}`, emailContent);
      }
    }

    res.status(200).json({ message: 'Collaborator added to devices.', added });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/devices/user/{userid}/device/{auid}/availability:
 *   put:
 *     tags:
 *       - Devices
 *     summary: Update device availability
 *     description: Allows a user to update the availability (public or private) of a registered device.
 *     parameters:
 *       - in: path
 *         name: userid
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID of the device owner.
 *       - in: path
 *         name: auid
 *         required: true
 *         schema:
 *           type: string
 *         description: AUID of the device.
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
 *                 example: "public"
 *     responses:
 *       200:
 *         description: Availability updated successfully.
 *       400:
 *         description: Invalid request or availability value.
 *       404:
 *         description: Device not found or not owned by user.
 *       500:
 *         description: Server error.
 */
router.put('/user/:userid/device/:auid/availability', async (req, res) => {
  const { userid, auid } = req.params;
  const { availability } = req.body;

  if (!['public', 'private'].includes(availability)) {
    return res.status(400).json({ message: 'Availability must be either "public" or "private".' });
  }

  try {
    const device = await registerNewDevice.findOne({ auid, userid });

    if (!device) {
      return res.status(404).json({ message: 'Device not found or does not belong to this user.' });
    }

    device.availability = availability;
    await device.save();

    return res.status(200).json({ message: `Device availability set to ${availability}.`, device });
  } catch (err) {
    console.error('Error updating device availability:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;