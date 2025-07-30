const express = require('express');
const router = express.Router();
const Deployment = require('../../../model/deployment/deploymentModel');
const RegisteredDevice = require('../../../model/devices/registerDevice');
const authenticateToken = require('../../../middleware/bearermiddleware');
const nanoid = require('nanoid')
const User = require('../../../model/user/userModel');


 
// Create deployment

/**
 * @swagger
 * /api/devices/create-deployments:
 *   post:
 *     tags:
 *       - Deployments
 *     summary: Create a new deployment
 *     description: Allows for the creation of a new deployment associated with a user.
 *     consumes:
 *       - application/json
 *     parameters:
 *       - in: body
 *         name: deployment
 *         description: The deployment to create
 *         required: true
 *         type: object
 *         properties:
 *           userid:
 *             type: string
 *             description: The user ID associated with the new deployment.
 *             example: "user123"
 *           name:
 *             type: string
 *             description: The name of the deployment.
 *             example: "My New Deployment"
 *           description:
 *             type: string
 *             description: A brief description of the deployment.
 *             example: "This deployment is intended for monitoring environmental data."
 *     responses:
 *       201:
 *         description: Deployment created successfully.
 *         examples:
 *           application/json: 
 *             message: "Deployment created successfully"
 *             deployment:
 *               deploymentid: "dep123"
 *               userid: "user123"
 *               name: "My New Deployment"
 *               description: "This deployment is intended for monitoring environmental data."
 *       400:
 *         description: Bad request - deployment with the same name already exists or other validation error.
 *       500:
 *         description: Internal server error.
 */

router.post('/create-deployments', async (req, res) => {
    try {
      const { userid, name, description } = req.body;
  
       const existingDeployment = await Deployment.findOne({ userid, name });
      if (existingDeployment) {
        return res.status(400).send({ message: 'Deployment with the same name already exists' });
      }
  
      const deploymentid = nanoid(10); 
       const newDeployment = new Deployment({ deploymentid, userid, name, description });
      await newDeployment.save();

      await User.findOneAndUpdate({ userid: userid }, {
        $push: { deployments: deploymentid}
      }, { new: true });
  
      res.status(201).send({ deployment: newDeployment ,message:"Deployment created successfuly"});
    } catch (error) {
      res.status(400).send(error);
    }
  });


// Get deployment by ID
/**
 * @swagger
 * /api/devices/deployments/{deploymentId}:
 *   get:
 *     tags:
 *       - Deployments
 *     summary: Get deployment by ID
 *     description: Retrieves a single deployment by its unique identifier.
 *     parameters:
 *       - name: deploymentId
 *         in: path
 *         description: The unique identifier of the deployment to retrieve.
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description: Deployment retrieved successfully.
 *       404:
 *         description: Deployment not found.
 *       500:
 *         description: Internal server error.
 */

router.get('/deployments/:deploymentId', async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const deployment = await Deployment.findOne({ deploymentid: deploymentId });
    if (!deployment) {
      return res.status(404).send({ message: 'Deployment not found' });
    }
    res.status(200).send({ deployment });
  } catch (error) {
    res.status(400).send(error);
  }
});

// Get devices in deployment
/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/devices:
 *   get:
 *     tags:
 *       - Deployments
 *     summary: Get devices in deployment
 *     description: Retrieves all devices associated with a specified deployment.
 *     parameters:
 *       - name: deploymentId
 *         in: path
 *         description: The unique identifier of the deployment whose devices are to be retrieved.
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description: Devices retrieved successfully.
 *       404:
 *         description: Deployment not found.
 *       500:
 *         description: Internal server error.
 */

router.get('/deployments/:deploymentId/devices', async (req, res) => {
    try {
      const { deploymentId } = req.params;
  
      // Find the deployment by ID
      const deployment = await Deployment.findOne({ deploymentid: deploymentId }).populate('devices');
  
      if (!deployment) {
        return res.status(404).send({ message: 'Deployment not found' });
      }
  
      // Extract devices from the deployment
      const devices = deployment.devices;
  
      res.status(200).send({ devices });
    } catch (error) {
      res.status(400).send(error);
    }
  });

// Update deployment information
/**
 * @swagger
 * /api/devices/deployments/{deploymentId}:
 *   put:
 *     tags:
 *       - Deployments
 *     summary: Update deployment information
 *     description: Updates information for a specified deployment.
 *     parameters:
 *       - name: deploymentId
 *         in: path
 *         required: true
 *         type: string
 *       - in: body
 *         name: deployment
 *         description: Object containing updated deployment information.
 *         required: true
 *         type: object
 *         properties:
 *           name:
 *             type: string
 *             description: Updated name of the deployment.
 *           description:
 *             type: string
 *             description: Updated description of the deployment.
 *     responses:
 *       200:
 *         description: Deployment updated successfully.
 *       404:
 *         description: Deployment not found.
 *       400:
 *         description: Deployment with the same name already exists.
 *       500:
 *         description: Internal server error.
 */

router.put('/deployments/:deploymentId', async (req, res) => {
    try {
      const { deploymentId } = req.params;
      const { name, description } = req.body;
  
      // Check if deployment exists
      const existingDeployment = await Deployment.findOne({ deploymentid: deploymentId });
      if (!existingDeployment) {
        return res.status(404).send({ message: 'Deployment not found' });
      }
  
      // Check if a deployment with the new name already exists
      const duplicateDeployment = await Deployment.findOne({ _id: { $ne: existingDeployment._id }, name });
      if (duplicateDeployment) {
        return res.status(400).send({ message: 'Deployment with the same name already exists' });
      }
  
      // Update deployment information
      existingDeployment.name = name;
      existingDeployment.description = description;
      await existingDeployment.save();
  
      res.status(200).send({ deployment: existingDeployment });
    } catch (error) {
      res.status(400).send(error);
    }
  });


// Delete deployment
/**
 * @swagger
 * /api/devices/deployments/{deploymentId}:
 *   delete:
 *     tags:
 *       - Deployments
 *     summary: Delete a deployment
 *     description: Deletes a deployment and its associated devices. Also removes the deployment from all user records who were associated with it.
 *     parameters:
 *       - name: deploymentId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique ID of the deployment to delete.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userid
 *             properties:
 *               userid:
 *                 type: string
 *                 description: The ID of the user making the request (must be the deployment creator).
 *     responses:
 *       200:
 *         description: Deployment deleted successfully.
 *       403:
 *         description: Only the creator of the deployment can delete it.
 *       404:
 *         description: Deployment not found.
 *       500:
 *         description: Internal server error.
 */
router.delete('/deployments/:deploymentId', async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const { userid } = req.body; // Owner making the request

    const deployment = await Deployment.findOne({ deploymentid: deploymentId });
    if (!deployment) {
      return res.status(404).json({ message: 'Deployment not found' });
    }

    // Ensure only the owner can delete
    if (deployment.userid !== userid) {
      return res.status(403).json({ message: 'Only the creator of the deployment can delete it.' });
    }

    // Remove the deployment from all users' deployments array
    await User.updateMany(
      { deployments: deploymentId },
      { $pull: { deployments: deploymentId } }
    );

    // Delete all associated devices
    await RegisteredDevice.deleteMany({ deployment: deploymentId });

    // Delete the deployment itself
    await Deployment.deleteOne({ deploymentid: deploymentId });

    res.status(200).json({ message: 'Deployment deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});


/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/devices:
 *   post:
 *     tags:
 *       - Deployments
 *     summary: Add a device to a deployment
 *     description: Adds an existing device to a specified deployment using the device's AUID.
 *     parameters:
 *       - name: deploymentId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the deployment.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               auid:
 *                 type: string
 *                 example: "devAUID123"
 *                 description: The AUID of the device to add.
 *     responses:
 *       200:
 *         description: Device added to deployment successfully.
 *       404:
 *         description: Deployment or device not found.
 *       400:
 *         description: Device already belongs to a deployment.
 *       500:
 *         description: Internal server error.
 */
router.post('/deployments/:deploymentId/devices', async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const { auid } = req.body;
console.log(auid)
    // Find the deployment
    const deployment = await Deployment.findOne({ deploymentid: deploymentId });
    if (!deployment) {
      return res.status(404).send({ message: 'Deployment not found' });
    }

    // Find the registered device by auid
    const registeredDevice = await RegisteredDevice.findOne({ auid: auid });
    if (!registeredDevice) {
      return res.status(404).send({ message: 'Device not found' });
    }

    // Ensure the device is not already associated with any deployment
    if (registeredDevice.deployment) {
      return res.status(400).send({ message: 'Device already belongs to a deployment' });
    }

    // Check if the device is already listed in the specified deployment
    if (deployment.devices.includes(registeredDevice.auid)) {
      return res.status(400).send({ message: 'Device is already associated with this deployment' });
    }

    // Associate the device with the deployment
    registeredDevice.deployment = deploymentId; // Assign the deployment ID to the device
    await registeredDevice.save();

    // Add the device's auid to the deployment's devices array
    deployment.devices.push(registeredDevice.auid);
    await deployment.save();

    res.status(200).send({ message: 'Device added to deployment successfully' });
  } catch (error) {
    res.status(500).send({ message: 'Internal server error', error: error.message });
  }
});



// Remove device from deployment using auid
/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/devices/{auid}:
 *   delete:
 *     tags:
 *       - Deployments
 *     summary: Remove a device from a deployment
 *     description: Removes a device from a specified deployment using the device's AUID.
 *     parameters:
 *       - name: deploymentId
 *         in: path
 *         required: true
 *         type: string
 *       - name: auid
 *         in: path
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description: Device removed from deployment successfully.
 *       404:
 *         description: Deployment or device not found.
 *       400:
 *         description: Device is not associated with the specified deployment.
 *       500:
 *         description: Internal server error.
 */

router.delete('/deployments/:deploymentId/devices/:auid', async (req, res) => {
  try {
    const { deploymentId, auid } = req.params;

    // Find the registered device by auid
    const registeredDevice = await RegisteredDevice.findOne({ auid });
    if (!registeredDevice) {
      return res.status(404).send({ message: 'Device not found' });
    }

    // Check if the device is associated with the specified deployment
    if (registeredDevice.deployment !== deploymentId) {
      return res.status(400).send({ message: 'Device is not associated with the specified deployment' });
    }

    // Disassociate the device from the deployment
    registeredDevice.deployment = null; // Or use registeredDevice.deployment = undefined to remove the property
    await registeredDevice.save();

    // Remove the device's auid from the deployment's devices array
    const deployment = await Deployment.findOne({ deploymentid: deploymentId });
    if (!deployment) {
      return res.status(404).send({ message: 'Deployment not found' });
    }
    deployment.devices = deployment.devices.filter(deviceAuid => deviceAuid !== auid);
    await deployment.save();

    res.status(200).send({ message: 'Device removed from deployment successfully' });
  } catch (error) {
    res.status(500).send({ message: 'Internal server error', error: error.message });
  }
});


// List user deployments
/**
 * @swagger
 * /api/devices/users/{userid}/deployments:
 *   get:
 *     tags:
 *       - Deployments
 *     summary: List user deployments
 *     description: Retrieves a list of all deployments associated with a specified user ID.
 *     parameters:
 *       - name: userid
 *         in: path
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description: User deployments retrieved successfully.
 *       404:
 *         description: No deployments found or user not found.
 *       500:
 *         description: Internal server error.
 */

router.get('/users/:userid/deployments', async (req, res) => {
  try {
    const { userid } = req.params;

    // Find the user and retrieve their deployments array
    const user = await User.findOne({ userid }).select('deployments');

    if (!user || !user.deployments || user.deployments.length === 0) {
      return res.status(404).json({ message: 'No deployments found for this user.' });
    }

    // Fetch deployment details based on the deployment IDs in the user's deployments array
    const deployments = await Deployment.find({ deploymentid: { $in: user.deployments } });

    if (!deployments || deployments.length === 0) {
      return res.status(404).json({ message: 'No deployment details found.' });
    }

    res.status(200).json({ deployments });
  } catch (error) {
    console.error('Error fetching deployments:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});


// Search deployments (example)
/**
 * @swagger
 * /api/devices/deployments/search:
 *   get:
 *     tags:
 *       - Deployments
 *     summary: Search deployments
 *     description: Searches for deployments that match a query string.
 *     parameters:
 *       - name: query
 *         in: query
 *         required: true
 *         type: string
 *         description: The query string to search deployments.
 *     responses:
 *       200:
 *         description: Deployments matching the search query retrieved successfully.
 *       400:
 *         description: No deployments found matching the query.
 *       500:
 *         description: Internal server error.
 */

router.get('/deployments/search', async (req, res) => {
  try {
    const { query } = req.query;
    const deployments = await Deployment.find({ $text: { $search: query } });
    res.status(200).send({ deployments });
  } catch (error) {
    res.status(400).send(error);
  }
});

// Remove device from deployment using auid and update the device's deployment field
/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/devices/{auid}/removeAndUpdate:
 *   delete:
 *     tags:
 *       - Deployments
 *     summary: Remove a device from a deployment and update device's record
 *     description: Removes a device from a specified deployment using the device's AUID and updates the device's record to reflect no current deployment.
 *     parameters:
 *       - name: deploymentId
 *         in: path
 *         required: true
 *         type: string
 *       - name: auid
 *         in: path
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description: Device removed from deployment and device's record updated successfully.
 *       404:
 *         description: Deployment or device not found.
 *       500:
 *         description: Internal server error.
 */

router.delete('/deployments/:deploymentId/devices/:auid', async (req, res) => {
  try {
    const { deploymentId, auid } = req.params;

    // Find the registered device by auid and ensure it is part of the specified deployment
    const registeredDevice = await RegisteredDevice.findOne({ auid, deployment: deploymentId });
    if (!registeredDevice) {
      return res.status(404).send({ message: 'Device not found or not part of the specified deployment' });
    }

    // Disassociate the device from the deployment by clearing the deployment field
    registeredDevice.deployment = null; // Clear the deployment field indicating no association
    await registeredDevice.save();

    // Remove the device's auid from the deployment's devices array
    const deployment = await Deployment.findOne({ deploymentid: deploymentId });
    if (!deployment) {
      return res.status(404).send({ message: 'Deployment not found' });
    }

    // Filter out the device's auid from the deployment's devices array
    deployment.devices = deployment.devices.filter(deviceAuid => deviceAuid !== auid);
    await deployment.save();

    res.status(200).send({ message: 'Device removed from deployment successfully' });
  } catch (error) {
    res.status(500).send({ message: 'Internal server error', error: error.message });
  }
});

/**
 * @swagger
 * /api/devices/deployments:
 *   get:
 *     tags:
 *       - Deployments
 *     summary: List all deployments
 *     description: Retrieves a list of all deployments available in the system.
 *     responses:
 *       200:
 *         description: A list of deployments.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deployments:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Deployment'
 *       500:
 *         description: Internal server error.
 */

// List all deployments
router.get('/deployments', async (req, res) => {
  try {
    const deployments = await Deployment.find({});
    res.status(200).send({ deployments });
  } catch (error) {
    res.status(500).send({ message: 'Internal server error', error: error.message });
  }
});


/**
 * @swagger
 * /api/devices/users/{userid}/organization/{organizationId}/deployments:
 *   delete:
 *     tags:
 *       - Deployments
 *       - Organizations
 *     summary: Remove a user from specific deployments
 *     description: Removes a user from specified deployments in a collaboration within an organization. This action cannot be performed if the user has admin privileges in the organization.
 *     parameters:
 *       - name: userid
 *         in: path
 *         required: true
 *         type: string
 *         description: The ID of the user to remove from the deployments.
 *       - name: organizationId
 *         in: path
 *         required: true
 *         type: string
 *         description: The ID of the organization that owns the deployments.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deployments:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: An array of deployment IDs from which the user should be removed.
 *                 example: ["dep123", "dep456"]
 *     responses:
 *       200:
 *         description: User removed from deployments successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User removed from deployments successfully."
 *       400:
 *         description: Invalid input or request.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "A valid array of deployments is required."
 *       403:
 *         description: User has admin privileges and cannot be removed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User with admin privileges cannot be removed from deployments."
 *       404:
 *         description: Organization or user not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Organization not found."
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 *                 error:
 *                   type: string
 */

router.delete('/users/:userid/organization/:organizationId/deployments', async (req, res) => {
  const { userid, organizationId } = req.params;
  const { deployments } = req.body; // Array of deployment IDs to remove the user from

  if (!deployments || !Array.isArray(deployments) || deployments.length === 0) {
    return res.status(400).json({ message: 'A valid array of deployments is required.' });
  }

  try {
    // Check if the user is an admin in the organization
    const organization = await Organization.findOne({ organizationId, 'collaborators.userId': userid });

    if (!organization) {
      return res.status(404).json({ message: 'Organization not found.' });
    }

    const userCollaborator = organization.collaborators.find(collaborator => collaborator.userId === userid);

    if (userCollaborator && userCollaborator.accessLevel === 'ADMIN') {
      return res.status(403).json({ message: 'User with admin privileges cannot be removed from deployments.' });
    }

    // Iterate over each deployment ID and remove the user from the deployment's collaborators
    for (const deploymentId of deployments) {
      // Remove the user from the deployment's collaborators
      await Deployment.updateOne(
        { deploymentid: deploymentId },
        { $pull: { collaborators: userid } }
      );
    }

    // Remove the deployments from the user's deployments array
    await User.updateOne(
      { userid },
      { $pull: { deployments: { $in: deployments } } }
    );

    res.status(200).json({ message: 'User removed from deployments successfully.' });
  } catch (error) {
    console.error('Error removing user from deployments:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});


/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/invite:
 *   post:
 *     tags:
 *       - Deployments
 *     summary: Invite a user to a deployment (by email)
 *     description: Allows the deployment creator to add an existing user to the deployment by their email. The requesting user ID must be provided to validate ownership.
 *     parameters:
 *       - name: deploymentId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the deployment to which the user will be added.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - userid
 *             properties:
 *               email:
 *                 type: string
 *                 example: "collab@example.com"
 *                 description: Email of the user to be invited.
 *               userid:
 *                 type: string
 *                 example: "user123"
 *                 description: User ID of the requester (must be the creator of the deployment).
 *     responses:
 *       200:
 *         description: User added to deployment successfully.
 *       400:
 *         description: User already added to this deployment.
 *       403:
 *         description: Only the creator of the deployment can invite users.
 *       404:
 *         description: Deployment or user not found.
 *       500:
 *         description: Internal server error.
 */

router.post('/deployments/:deploymentId/invite', async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const { email, userid } = req.body; // userid = requesting user (deployment owner)

    const deployment = await Deployment.findOne({ deploymentid: deploymentId });
    if (!deployment) return res.status(404).json({ message: 'Deployment not found' });

    if (deployment.userid !== userid) {
      return res.status(403).json({ message: 'Only the creator of the deployment can invite users.' });
    }

    const userToInvite = await User.findOne({ email });
    if (!userToInvite) return res.status(404).json({ message: 'User not found' });

    const targetUserId = userToInvite.userid;

    if (deployment.collaborators.includes(targetUserId) && userToInvite.deployments.includes(deploymentId)) {
      return res.status(400).json({ message: 'User already added to this deployment' });
    }

    if (!deployment.collaborators.includes(targetUserId)) {
      deployment.collaborators.push(targetUserId);
    }

    if (!userToInvite.deployments.includes(deploymentId)) {
      userToInvite.deployments.push(deploymentId);
    }

    await deployment.save();
    await userToInvite.save();

    res.status(200).json({ message: 'User added to deployment successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

/**
 * @swagger
 * /api/devices/deployments/{deploymentId}/collaborators/{targetUserid}:
 *   delete:
 *     tags:
 *       - Deployments
 *     summary: Remove a user from a deployment
 *     description: Allows the deployment creator to remove a user from the deployment using their user ID. Requesting user ID must be submitted in the body.
 *     parameters:
 *       - name: deploymentId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Deployment ID from which the user will be removed.
 *       - name: targetUserid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID of the collaborator to be removed.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userid
 *             properties:
 *               userid:
 *                 type: string
 *                 description: The ID of the user making the request (must be the deployment creator).
 *                 example: "user123"
 *     responses:
 *       200:
 *         description: User removed from deployment successfully.
 *       403:
 *         description: Only the creator of the deployment can remove users.
 *       404:
 *         description: Deployment or user not found.
 *       500:
 *         description: Internal server error.
 */

router.delete('/deployments/:deploymentId/collaborators/:targetUserid', async (req, res) => {
  try {
    const { deploymentId, targetUserid } = req.params;
    const { userid } = req.body; // the one making the request

    const deployment = await Deployment.findOne({ deploymentid: deploymentId });
    const targetUser = await User.findOne({ userid: targetUserid });

    if (!deployment || !targetUser) return res.status(404).json({ message: 'Deployment or user not found' });

    if (deployment.userid !== userid) {
      return res.status(403).json({ message: 'Only the creator of the deployment can remove collaborators.' });
    }

    deployment.collaborators = deployment.collaborators.filter(id => id !== targetUserid);
    targetUser.deployments = targetUser.deployments.filter(id => id !== deploymentId);

    await deployment.save();
    await targetUser.save();

    res.status(200).json({ message: 'User removed from deployment successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});


 /**
 * @swagger
 * /api/devices/deployments/{deploymentId}/collaborators:
 *   post:
 *     tags:
 *       - Deployments
 *     summary: List collaborators in a deployment
 *     description: Lists all users' emails and names associated with a given deployment. Only the deployment creator can access this list.
 *     parameters:
 *       - name: deploymentId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the deployment to fetch collaborators from.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userid
 *             properties:
 *               userid:
 *                 type: string
 *                 description: The ID of the user making the request (must be the deployment creator).
 *                 example: "user123"
 *     responses:
 *       200:
 *         description: List of collaborators returned successfully.
 *       403:
 *         description: Only the creator of the deployment can view collaborators.
 *       404:
 *         description: Deployment not found.
 *       500:
 *         description: Internal server error.
 */

 router.post('/deployments/:deploymentId/collaborators', async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const { userid } = req.body; // the one making the request

    const deployment = await Deployment.findOne({ deploymentid: deploymentId });
    if (!deployment) return res.status(404).json({ message: 'Deployment not found' });

    if (deployment.userid !== userid) {
      return res.status(403).json({ message: 'Only the creator of the deployment can view collaborators.' });
    }

    const users = await User.find({ userid: { $in: deployment.collaborators } }).select('email firstName lastName');

    res.status(200).json({ collaborators: users });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});



module.exports = router;
