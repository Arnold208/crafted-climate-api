'use strict';
const MRVProject = require('../../models/mrv/project/MRVProject.model');

const MRV_ROLES = ['mrv-project-manager', 'mrv-field-officer', 'mrv-data-reviewer', 'mrv-methodology-manager', 'mrv-report-manager', 'mrv-independent-verifier', 'mrv-programme-admin', 'mrv-auditor'];

/**
 * verifyMRVProjectAccess
 * Checks that the authenticated user is a member of the specified MRV project
 * OR is a platform admin. Sets req.mrvRole and req.mrvProject on success.
 *
 * Usage: router.get('/project/:projectId/...', auth, verifyMRVProjectAccess(), ctrl)
 * For admin-only operations: verifyMRVProjectAccess(['mrv-programme-admin', 'mrv-project-manager'])
 */
function verifyMRVProjectAccess(requiredRoles = null) {
  return async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      if (user.platformRole === 'admin') {
        req.mrvRole = 'mrv-programme-admin';
        // Platform admins bypass member checks but route handlers may still need req.mrvProject
        const pid = req.params.projectId || req.body?.projectId || req.query?.projectId;
        if (pid) {
          const adminProject = await MRVProject.findOne({ projectId: pid, deletedAt: null }).lean();
          req.mrvProject = adminProject || null;
        }
        return next();
      }


      const projectId = req.params.projectId || req.body?.projectId || req.query?.projectId;
      if (!projectId) return res.status(400).json({ error: 'projectId is required for MRV access check' });

      const project = await MRVProject.findOne({ projectId, deletedAt: null }).lean();
      if (!project) return res.status(404).json({ error: 'MRV project not found' });

      const member = project.members?.find(m => m.userId === user.userid || m.userId === user._id?.toString());
      if (!member) return res.status(403).json({ error: 'You do not have MRV project access. Contact the project manager.' });

      if (requiredRoles && !requiredRoles.includes(member.role)) {
        return res.status(403).json({ error: `This action requires one of: ${requiredRoles.join(', ')}. Your role: ${member.role}` });
      }

      req.mrvRole = member.role;
      req.mrvProject = project;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * requireMRVPermission
 * Lightweight org-level MRV feature flag check (no project ID needed).
 * Ensures the organization has mrvEnabled = true.
 */
async function requireMRVFeatureEnabled(req, res, next) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (user.platformRole === 'admin') return next();
    const Organization = require('../../models/organization/organizationModel');
    const orgId = req.params.organizationId || req.query.organizationId || req.body?.organizationId || req.currentOrgId;
    if (!orgId) return res.status(400).json({ error: 'organizationId required' });
    const org = await Organization.findOne({ organizationId: orgId }).lean();
    if (!org?.mrvEnabled) return res.status(403).json({ error: 'MRV Engine is not enabled for this organization. Contact platform admin.' });
    next();
  } catch (err) { next(err); }
}

module.exports = { verifyMRVProjectAccess, requireMRVFeatureEnabled, MRV_ROLES };
