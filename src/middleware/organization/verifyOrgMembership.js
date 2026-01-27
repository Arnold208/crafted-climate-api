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

const Organization = require('../../models/organization/organizationModel');
const CacheService = require('../../modules/common/cache.service');

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
    // 3. Load the organization (Cached)
    // Key: org:{id}:meta - Cache full org meta/collaborators? Or just specific membership?
    // Since we need fullOrg for req.currentOrganization, let's cache the object.
    // CAUTION: Collaborator list can grow. If large, this is heavy. 
    // Optimization: Cache smaller "membership lookup" if possible, but existing code wants full org.
    // For now, cache the full doc to preserve identical behavior safely.
    // TTL: 1 hour (3600)
    const cacheKey = `org:${orgId}:meta`;

    let organization = await CacheService.getOrSet(cacheKey, async () => {
      return await Organization.findOne({ organizationId: orgId, deletedAt: null });
    }, 3600);

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

    // FIX: Attach the full membership object so downstream RBAC can check permissions
    req.orgMembership = membership;

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
