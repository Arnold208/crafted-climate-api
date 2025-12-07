// routes/organization/organization.js

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

const Organization = require('../../model/organization/organizationModel');
const User = require('../../model/user/userModel');

const authenticateToken = require('../../middleware/user/bearermiddleware');
const orgContext = require('../../middleware/org/orgContext');
const requireOrgRole = require('../../middleware/org/requireOrgRole');

/**
 * @swagger
 * tags:
 *   name: Organizations
 *   description: Organization & multi-tenant administration APIs
 */


/**
 * @swagger
 * /api/orgs:
 *   post:
 *     tags: [Organizations]
 *     summary: Create a new organization
 *     description: Creates an organization where the authenticated user becomes the owner.
 *     security:
 *       - bearerAuth: []
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
 *                 example: "Crafted Climate Labs"
 *               description:
 *                 type: string
 *                 example: "Environmental research and monitoring group"
 *     responses:
 *       201:
 *         description: Organization created successfully
 *       400:
 *         description: Missing required name field
 *       500:
 *         description: Server error
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).send({ message: "Organization name is required" });

    const orgid = uuidv4();

    const org = await Organization.create({
      orgid,
      name,
      description,
      ownerUserid: req.user.userid,
      collaborators: [
        {
          userid: req.user.userid,
          role: "owner",
          permissions: []
        }
      ]
    });

    // Add org to user profile
    await User.updateOne(
      { userid: req.user.userid },
      {
        $addToSet: { organizations: orgid },
        $set: { [`orgRoles.${orgid}`]: "owner" }
      }
    );

    res.status(201).send({ message: "Organization created", org });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});


/**
 * @swagger
 * /api/orgs/{orgid}:
 *   get:
 *     tags: [Organizations]
 *     summary: Get organization details
 *     description: Fetches full details of an organization the user belongs to.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: orgid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           example: "a1b2c3-org"
 *     responses:
 *       200:
 *         description: Organization details returned
 *       403:
 *         description: User does not have permission to view the org
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Server error
 */
router.get('/:orgid',
  authenticateToken,
  orgContext,
  requireOrgRole('owner','admin','editor','viewer'),
  async (req, res) => {

    try {
      const org = await Organization.findOne({ orgid: req.params.orgid });
      if (!org) return res.status(404).send({ message: "Organization not found" });

      res.status(200).send(org);
    } catch (err) {
      res.status(500).send({ message: err.message });
    }
});


/**
 * @swagger
 * /api/orgs:
 *   get:
 *     tags: [Organizations]
 *     summary: List all organizations the user belongs to
 *     description: Returns organizations where the user is a member or owner.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of organizations
 *       500:
 *         description: Server error
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ userid: req.user.userid }, { organizations: 1 });

    const orgs = await Organization.find({ orgid: { $in: user.organizations || [] } });

    res.status(200).send(orgs);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});


/**
 * @swagger
 * /api/orgs/{orgid}:
 *   put:
 *     tags: [Organizations]
 *     summary: Update organization details
 *     description: Only org **owner** or **admin** can update organization settings.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgid
 *         required: true
 *         schema:
 *           type: string
 *           example: "a1b2c3-org"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Updated Org Name"
 *               description:
 *                 type: string
 *                 example: "New description"
 *     responses:
 *       200:
 *         description: Organization updated successfully
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Server error
 */
router.put('/:orgid',
  authenticateToken,
  orgContext,
  requireOrgRole('owner','admin'),
  async (req, res) => {

    try {
      const updated = await Organization.findOneAndUpdate(
        { orgid: req.params.orgid },
        req.body,
        { new: true }
      );

      if (!updated) return res.status(404).send({ message: "Organization not found" });

      res.status(200).send({ message: "Organization updated", org: updated });
    } catch (err) {
      res.status(500).send({ message: err.message });
    }
});


/**
 * @swagger
 * /api/orgs/{orgid}:
 *   delete:
 *     tags: [Organizations]
 *     summary: Delete an organization
 *     description: Only the **owner** can delete the organization.
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
 *         description: Organization deleted
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Server error
 */
router.delete('/:orgid',
  authenticateToken,
  orgContext,
  requireOrgRole('owner'),
  async (req, res) => {

    try {
      const deleted = await Organization.findOneAndDelete({ orgid: req.params.orgid });
      if (!deleted) return res.status(404).send({ message: "Organization not found" });

      res.status(200).send({ message: "Organization deleted" });
    } catch (err) {
      res.status(500).send({ message: err.message });
    }
});


/**
 * @swagger
 * /api/orgs/{orgid}/members:
 *   get:
 *     tags: [Organizations]
 *     summary: List all members of an organization
 *     description: Only **owner** and **admin** can view all members.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgid
 *         required: true
 *     responses:
 *       200:
 *         description: List of members returned
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Server error
 */
router.get('/:orgid/members',
  authenticateToken,
  orgContext,
  requireOrgRole('owner','admin'),
  async (req, res) => {

    try {
      const org = await Organization.findOne({ orgid: req.params.orgid });
      if (!org) return res.status(404).send({ message: "Organization not found" });

      res.status(200).send(org.collaborators);
    } catch (err) {
      res.status(500).send({ message: err.message });
    }
});


/**
 * @swagger
 * /api/orgs/{orgid}/members/{userid}:
 *   delete:
 *     tags: [Organizations]
 *     summary: Remove a member from the organization
 *     description: Admins and Owners can remove any member except the owner.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgid
 *         required: true
 *       - in: path
 *         name: userid
 *         required: true
 *     responses:
 *       200:
 *         description: Member removed successfully
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Organization or user not found
 *       500:
 *         description: Server error
 */
router.delete('/:orgid/members/:userid',
  authenticateToken,
  orgContext,
  requireOrgRole('owner','admin'),
  async (req, res) => {

    try {
      const { orgid, userid } = req.params;

      const org = await Organization.findOne({ orgid });
      if (!org) return res.status(404).send({ message: "Organization not found" });

      org.collaborators = org.collaborators.filter(c => c.userid !== userid);
      await org.save();

      await User.updateOne(
        { userid },
        {
          $unset: { [`orgRoles.${orgid}`]: "" },
          $pull: { organizations: orgid }
        }
      );

      res.status(200).send({ message: "Member removed" });
    } catch (err) {
      res.status(500).send({ message: err.message });
    }
});


/**
 * @swagger
 * /api/orgs/{orgid}/members/{userid}/role:
 *   patch:
 *     tags: [Organizations]
 *     summary: Update a member's role inside an organization
 *     description: Only **owner** or **admin** can update another user's org role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgid
 *         required: true
 *       - in: path
 *         name: userid
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [owner, admin, editor, viewer]
 *                 example: "admin"
 *     responses:
 *       200:
 *         description: Role updated successfully
 *       400:
 *         description: Invalid role
 *       404:
 *         description: Member not found
 *       500:
 *         description: Server error
 */
router.patch('/:orgid/members/:userid/role',
  authenticateToken,
  orgContext,
  requireOrgRole('owner','admin'),
  async (req, res) => {

    try {
      const { orgid, userid } = req.params;
      const { role } = req.body;

      if (!['owner','admin','editor','viewer'].includes(role)) {
        return res.status(400).send({ message: "Invalid role" });
      }

      const org = await Organization.findOne({ orgid });
      if (!org) return res.status(404).send({ message: "Organization not found" });

      const member = org.collaborators.find(c => c.userid === userid);
      if (!member) return res.status(404).send({ message: "User not in organization" });

      member.role = role;
      await org.save();

      await User.updateOne(
        { userid },
        { $set: { [`orgRoles.${orgid}`]: role } }
      );

      res.status(200).send({ message: "Member role updated" });
    } catch (err) {
      res.status(500).send({ message: err.message });
    }
});

module.exports = router;
