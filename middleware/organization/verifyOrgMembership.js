/**
 * Verify Organization Membership Middleware
 * =========================================
 * Validates that:
 *  1. User is authenticated
 *  2. User belongs to the requested organization
 *  3. Organization exists
 *
 * Attaches req.currentOrgId and req.currentOrgRole for downstream handlers
 */

const Organization = require('../../model/organization/organizationModel');

module.exports = async function verifyOrgMembership(req, res, next) {
  try {
    // 1. User must be authenticated (JWT middleware should run first)
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "Unauthorized: Missing user context" });
    }

    // 2. Get the organization from header or user's current org
    const orgId = req.headers['x-org-id'] || user.currentOrganizationId;
    if (!orgId) {
      return res.status(400).json({ message: "No organization selected (missing x-org-id header or currentOrganizationId)" });
    }

    // 3. Load the organization
    const organization = await Organization.findOne({ organizationId: orgId });
    if (!organization) {
      return res.status(404).json({ message: "Organization not found" });
    }

    // 4. Check membership - find user in collaborators
    const membership = organization.collaborators.find(
      c => c.userid === user.userid
    );

    if (!membership) {
      return res.status(403).json({
        message: "Forbidden: You do not belong to this organization"
      });
    }

    // 5. Attach org context for downstream handlers
    req.currentOrgId = orgId;
    req.currentOrgRole = membership.role; // org-admin, org-support, org-user
    req.currentOrganization = organization;

    next();

  } catch (error) {
    console.error("Organization membership verification error:", error);
    return res.status(500).json({
      message: "Internal error verifying organization membership",
      error: error.message
    });
  }
};
