// middleware/org/orgContext.js
const Organization = require("../../model/organization/organizationModel");
const OrgMember = require("../../model/organization/OrgMember");

/**
 * Resolve organization context and user membership.
 *
 * Looks for orgid in:
 *  - req.headers["x-org-id"]
 *  - req.params.orgid
 *  - req.body.orgid
 *
 * Attaches:
 *  - req.org
 *  - req.orgMembership (if found)
 */
async function orgContext(req, res, next) {
  try {
    const userid = req.user?.userid;
    if (!userid) {
      return res.status(401).json({ message: "Unauthenticated: no userid on request" });
    }

    const headerOrgId = req.headers["x-org-id"] || req.headers["X-Org-Id"];
    const paramOrgId = req.params?.orgid;
    const bodyOrgId = req.body?.orgid;

    const orgid = headerOrgId || paramOrgId || bodyOrgId;

    if (!orgid) {
      return res.status(400).json({ message: "Missing orgid in header, params, or body." });
    }

    const org = await Organization.findOne({ orgid }).lean();
    if (!org) {
      return res.status(404).json({ message: "Organization not found" });
    }

    // If user is org owner, treat as implicit member with 'owner' role
    let membership = await OrgMember.findOne({ orgid, userid }).lean();
    if (!membership && org.ownerUserid === userid) {
      membership = {
        orgid,
        userid,
        role: "owner",
        permissions: ["*"],
        status: "active"
      };
    }

    if (!membership) {
      return res.status(403).json({ message: "You are not a member of this organization" });
    }

    if (membership.status !== "active") {
      return res.status(403).json({ message: `Org membership is ${membership.status}` });
    }

    req.org = org;
    req.orgMembership = membership;
    req.orgid = orgid; // convenience
    return next();
  } catch (err) {
    console.error("orgContext error:", err);
    return res.status(500).json({ message: "Internal server error (orgContext)", error: err.message });
  }
}

module.exports = orgContext;
