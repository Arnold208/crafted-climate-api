'use strict';
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const authenticateToken = require('../../middleware/bearermiddleware');
const { requirePermission } = require('../../middleware/authenticateApiKey');
const { verifyMRVProjectAccess, requireMRVFeatureEnabled } = require('../../middleware/mrv/verifyMRVProjectAccess');
const { mrvAuditEvent } = require('../../middleware/mrv/mrvAuditEvent');
const MRVProject = require('../../models/mrv/project/MRVProject.model');
const MRVSite = require('../../models/mrv/project/MRVSite.model');
const MRVProjectPartner = require('../../models/mrv/project/MRVProjectPartner.model');
const ProjectMethodologyAssignment = require('../../models/mrv/project/ProjectMethodologyAssignment.model');
const ReadinessAssessment = require('../../models/mrv/project/ReadinessAssessment.model');
const Organization = require('../../models/organization/organizationModel');
const User = require('../../models/user/userModel');
const MRVProjectInvitation = require('../../models/mrv/project/MRVProjectInvitation.model');
const { sendCCEmailSafe } = require('../../services/email/craftedClimateMailer');
const { runApplicabilityAssessment } = require('../../services/mrv/mrvApplicabilityService');
const { runReadinessAssessment }     = require('../../services/mrv/mrvReadinessService');
const MRV_ROLES = [
  'mrv-project-manager',
  'mrv-field-officer',
  'mrv-data-reviewer',
  'mrv-methodology-manager',
  'mrv-report-manager',
  'mrv-independent-verifier',
  'mrv-programme-admin',
  'mrv-auditor',
];
const ORG_ROLES = ['org-admin', 'org-support', 'org-user', 'viewer', 'editor'];

const userDisplayName = (user) => {
  if (!user) return '';
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.email || user.userid;
};


const OPERATIONAL_PROJECT_STATUSES = new Set(['MONITORING', 'CALCULATION', 'VVB_VERIFICATION', 'VERRA_REVIEW', 'ISSUANCE_COMPLETE']);

function mrvProjectActionState(project) {
  if (project.readinessStatus === 'NOT_READY') return 'BLOCKED';
  if (project.applicabilityStatus === 'NOT_APPLICABLE' || project.applicabilityStatus === 'REQUIRES_REVIEW') return 'BLOCKED';
  if (project.readinessStatus === 'READY' && !OPERATIONAL_PROJECT_STATUSES.has(project.status)) return 'READY_TO_START';
  if (project.status === 'READY_FOR_MONITORING') return 'READY_TO_START';
  if (project.status === 'MONITORING') return 'MONITORING';
  if (project.status === 'CALCULATION') return 'CALCULATION_REVIEW';
  if (project.status === 'VVB_VERIFICATION') return 'VERIFIER_REVIEW';
  if (project.status === 'VERRA_REVIEW') return 'VERRA_REVIEW';
  return 'SETUP_IN_PROGRESS';
}

function mrvProjectNextAction(project) {
  const actionState = mrvProjectActionState(project);
  if (actionState === 'BLOCKED') return 'Resolve readiness items';
  if (actionState === 'READY_TO_START') return 'Open monitoring period';
  if (actionState === 'MONITORING') return 'Review data quality';
  if (actionState === 'CALCULATION_REVIEW') return 'Review calculation run';
  if (actionState === 'VERIFIER_REVIEW') return 'Support verifier review';
  if (actionState === 'VERRA_REVIEW') return 'Track Verra review';
  return 'Continue project setup';
}
function canManageProjectArchive(project, user) {
  if (user?.platformRole === 'admin') return true;
  const userId = user?.userid || user?._id?.toString();
  const member = (project?.members || []).find((item) => item.userId === userId);
  return ['mrv-project-manager', 'mrv-programme-admin'].includes(member?.role);
}

async function buildProjectTeamContext(projectId) {
  const project = await MRVProject.findOne({ projectId, deletedAt: null }).lean();
  if (!project) {
    const err = new Error('Project not found');
    err.status = 404;
    throw err;
  }

  const org = await Organization.findOne({ organizationId: project.organizationId, deletedAt: null }).lean();
  if (!org) {
    const err = new Error('Organization not found');
    err.status = 404;
    throw err;
  }

  const orgMemberIds = (org.collaborators || []).map((member) => member.userid).filter(Boolean);
  const projectMemberIds = (project.members || []).map((member) => member.userId).filter(Boolean);
  const userIds = [...new Set([...orgMemberIds, ...projectMemberIds])];
  const users = await User.find(
    { userid: { $in: userIds } },
    'userid firstName lastName username email profilePicture status lastActive',
  ).lean();
  const usersById = new Map(users.map((user) => [user.userid, user]));
  const projectRoleByUser = new Map((project.members || []).map((member) => [member.userId, member]));

  const organizationMembers = (org.collaborators || []).map((member) => {
    const user = usersById.get(member.userid);
    const projectMember = projectRoleByUser.get(member.userid);
    return {
      userid: member.userid,
      name: userDisplayName(user),
      email: user?.email || '',
      orgRole: member.role,
      permissions: member.permissions || [],
      joinedAt: member.joinedAt || member.addedAt,
      profilePicture: user?.profilePicture,
      status: user?.status,
      lastActive: user?.lastActive,
      projectRole: projectMember?.role || null,
      projectAddedAt: projectMember?.addedAt || null,
    };
  });

  const projectMembers = (project.members || []).map((member) => {
    const user = usersById.get(member.userId);
    const orgMember = (org.collaborators || []).find((collab) => collab.userid === member.userId);
    return {
      userId: member.userId,
      name: userDisplayName(user),
      email: user?.email || '',
      role: member.role,
      orgRole: orgMember?.role || null,
      addedAt: member.addedAt,
      addedBy: member.addedBy,
      profilePicture: user?.profilePicture,
      status: user?.status,
    };
  });

  const invitations = await MRVProjectInvitation.find({
    projectId,
    accepted: false,
    expiresAt: { $gt: new Date() },
  }).lean();
  invitations.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  return {
    organization: {
      organizationId: org.organizationId,
      name: org.name,
      planType: org.planType,
      organizationType: org.organizationType,
    },
    project: {
      projectId: project.projectId,
      name: project.name,
      status: project.status,
    },
    organizationMembers,
    projectMembers,
    invitations: invitations.map((invite) => ({
      invitationId: invite.invitationId,
      email: invite.email,
      orgRole: invite.orgRole,
      mrvRole: invite.mrvRole,
      needsSignUp: invite.needsSignUp,
      invitedBy: invite.invitedBy,
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
    })),
    roles: { mrvRoles: MRV_ROLES, orgRoles: ORG_ROLES },
  };
}

/**
 * @swagger
 * /api/mrv/projects:
 *   get:
 *     summary: List MRV projects for an organization
 *     description: |
 *       Returns all MRV projects the authenticated user is a member of within the given organization.
 *       Platform admins see all projects. Regular users only see projects they are members of.
 *     tags: [MRV Engine - Projects]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         required: true
 *         schema: { type: string }
 *         description: Organization ID to list projects for
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [SANDBOX, CANDIDATE, APPLICABILITY_REVIEW, LEGAL_REVIEW, READY_FOR_MONITORING, MONITORING, CALCULATION, VVB_VERIFICATION, VERRA_REVIEW, ISSUANCE_COMPLETE, PROJECT_CLOSED, WITHDRAWN, SUSPENDED]
 *         description: Filter by project status
 *     responses:
 *       200:
 *         description: List of MRV projects
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/MRVProject' }
 *       400:
 *         description: organizationId is required
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MRVError400' }
 *       401:
 *         description: Unauthorized
 */
router.get('/', authenticateToken, requirePermission('mrv:projects:read'), async (req, res) => {
  try {
    const user = req.user;
    const orgId = req.query.organizationId;
    if (!orgId) return res.status(400).json({ error: 'organizationId query param required' });

    const archivedOnly = ['true', '1', 'only'].includes(String(req.query.archived || '').toLowerCase());
    const includeDeleted = ['true', '1'].includes(String(req.query.includeDeleted || '').toLowerCase());
    const filter = { organizationId: orgId };
    if (archivedOnly) filter.deletedAt = { $ne: null };
    else if (!includeDeleted) filter.deletedAt = null;

    if (user.platformRole !== 'admin') {
      filter['members.userId'] = user.userid || user._id?.toString();
    }
    if (req.query.status) filter.status = req.query.status;
    const projects = await MRVProject.find(filter).sort({ _id: -1 }).lean();
    const rows = projects.map((project) => ({
      ...project,
      archived: Boolean(project.deletedAt),
      actionState: mrvProjectActionState(project),
      nextAction: project.deletedAt ? 'Restore project or keep archived' : mrvProjectNextAction(project),
    }));
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects:
 *   post:
 *     summary: Create a new MRV project
 *     description: |
 *       Creates a new MRV project. The project ID is auto-generated (dynamic — never hardcoded).
 *       The creating user is automatically added as `mrv-project-manager`.
 *
 *       **Sandbox projects**: Set `sandboxFlag: true` to create a `SANDBOX_NON_CREDITING` development project.
 *       These are for testing and development only and will never generate credits.
 *
 *       **Standard version**: Defaults to `VERRA-VCS-5.0`. Setting `VERRA-VCS-4.7` is supported but the
 *       project will be marked with a transition deadline warning.
 *     tags: [MRV Engine - Projects]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateProjectRequest' }
 *           examples:
 *             sandbox:
 *               summary: Sandbox development project
 *               value:
 *                 name: "Foovante Clean Cooking Project Ghana — Sandbox"
 *                 description: "Software development and testing project — non-crediting"
 *                 activityType: CLEAN_COOKING
 *                 claimType: GHG_REDUCTION
 *                 organizationId: "org-abc123"
 *                 sandboxFlag: true
 *                 sandboxNote: "SANDBOX_NON_CREDITING — for development and testing only"
 *                 selectedStandardVersionId: VERRA-VCS-5.0
 *                 country: GH
 *                 region: Greater Accra
 *             production:
 *               summary: Production project (Candidate)
 *               value:
 *                 name: "Foovante Clean Cooking Project Ghana"
 *                 activityType: CLEAN_COOKING
 *                 claimType: GHG_REDUCTION
 *                 organizationId: "org-abc123"
 *                 selectedStandardVersionId: VERRA-VCS-5.0
 *                 country: GH
 *                 projectStart: "2025-01-01"
 *     responses:
 *       201:
 *         description: Project created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/MRVProject' }
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MRVError400' }
 *       403:
 *         description: MRV Engine not enabled for this organization
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MRVError403' }
 */
router.post('/', authenticateToken, requirePermission('mrv:projects:write'), requireMRVFeatureEnabled,
  mrvAuditEvent({ action: 'PROJECT_CREATED', entityType: 'MRVProject', getEntityId: (req, body) => body?.data?.projectId }),
  async (req, res) => {
    try {
      const { name, description, activityType, claimType, organizationId, sandboxFlag, sandboxNote, selectedStandardVersionId, country, region, projectStart } = req.body;
      if (!name || !activityType || !claimType || !organizationId) return res.status(400).json({ error: 'name, activityType, claimType, organizationId are required' });
      const projectId = `CC-${activityType.slice(0, 4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
      const project = await MRVProject.create({
        projectId, organizationId, name, description, activityType, claimType,
        status: sandboxFlag ? 'SANDBOX' : 'CANDIDATE',
        sandboxFlag: !!sandboxFlag, sandboxNote: sandboxNote || null,
        selectedStandardVersionId: selectedStandardVersionId || 'VERRA-VCS-5.0',
        country: country || 'GH', region, projectStart: projectStart ? new Date(projectStart) : null,
        createdBy: req.user?.userid || req.user?._id?.toString(),
        members: [{ userId: req.user?.userid || req.user?._id?.toString(), role: 'mrv-project-manager', addedAt: new Date(), addedBy: 'system' }]
      });
      await Organization.findOneAndUpdate({ organizationId }, { $addToSet: { mrvProjectIds: projectId } });
      res.status(201).json({ success: true, data: project });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

/**
 * @swagger
 * /api/mrv/projects/{projectId}:
 *   get:
 *     summary: Get a single MRV project by ID
 *     description: Returns full project details. Requires the caller to be a project member or platform admin.
 *     tags: [MRV Engine - Projects]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string, example: CC-CLEA-LZKJ3MN }
 *     responses:
 *       200:
 *         description: Project details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/MRVProject' }
 *       403:
 *         description: Not a project member
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MRVError403' }
 *       404:
 *         description: Project not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MRVError404' }
 */
router.get('/:projectId', authenticateToken, requirePermission('mrv:projects:read'), verifyMRVProjectAccess(), async (req, res) => {
  try { res.json({ success: true, data: req.mrvProject }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}:
 *   patch:
 *     summary: Update MRV project fields
 *     description: |
 *       Update mutable project fields. The following fields are **immutable** and will be ignored if included:
 *       `projectId`, `organizationId`, `createdBy`, `createdAt`, `selectedStandardVersionId`, `sandboxFlag`.
 *
 *       Requires role: `mrv-project-manager` or `mrv-programme-admin`.
 *     tags: [MRV Engine - Projects]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               status: { type: string, enum: [CANDIDATE, APPLICABILITY_REVIEW, LEGAL_REVIEW, READY_FOR_MONITORING, MONITORING, CALCULATION, VVB_VERIFICATION, VERRA_REVIEW, ISSUANCE_COMPLETE, PROJECT_CLOSED, WITHDRAWN, SUSPENDED] }
 *               region: { type: string }
 *               country: { type: string }
 *               projectStart: { type: string, format: date }
 *               projectEnd: { type: string, format: date }
 *               sandboxNote: { type: string }
 *     responses:
 *       200:
 *         description: Updated project
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/MRVProject' }
 *       403:
 *         description: Insufficient role
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MRVError403' }
 */
router.patch('/:projectId', authenticateToken, requirePermission('mrv:projects:write'), verifyMRVProjectAccess(['mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'PROJECT_UPDATED', entityType: 'MRVProject' }),
  async (req, res) => {
    try {
      const IMMUTABLE = ['projectId', 'organizationId', 'createdBy', 'createdAt', 'selectedStandardVersionId', 'sandboxFlag'];
      const updates = { ...req.body };
      for (const f of IMMUTABLE) delete updates[f];
      updates.updatedAt = new Date();
      const updated = await MRVProject.findOneAndUpdate({ projectId: req.params.projectId }, { $set: updates }, { new: true });
      res.json({ success: true, data: updated });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// ── Sites ──────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/mrv/projects/{projectId}/archive:
 *   patch:
 *     summary: Archive an MRV project without deleting audit records
 *     description: Soft-deletes the project by setting deletedAt. Related MRV records remain intact and the project is hidden from normal portfolio lists.
 *     tags: [MRV Engine - Projects]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, example: Created in error or no longer active }
 *     responses:
 *       200:
 *         description: Project archived
 */
router.patch('/:projectId/archive', authenticateToken, requirePermission('mrv:projects:write'), verifyMRVProjectAccess(['mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'PROJECT_ARCHIVED', entityType: 'MRVProject', getEntityId: (req) => req.params.projectId }),
  async (req, res) => {
    try {
      const now = new Date();
      const updated = await MRVProject.findOneAndUpdate(
        { projectId: req.params.projectId, deletedAt: null },
        {
          $set: {
            deletedAt: now,
            deletedBy: req.user?.userid || req.user?._id?.toString(),
            deleteReason: String(req.body?.reason || '').trim() || undefined,
            updatedAt: now,
          },
        },
        { new: true },
      ).lean();
      if (!updated) return res.status(404).json({ error: 'Active MRV project not found' });
      res.json({ success: true, data: { ...updated, archived: true, nextAction: 'Restore project or keep archived' } });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

/**
 * @swagger
 * /api/mrv/projects/{projectId}/restore:
 *   patch:
 *     summary: Restore an archived MRV project
 *     description: Clears deletedAt so the project appears in normal MRV portfolio lists again. Related audit records are not modified.
 *     tags: [MRV Engine - Projects]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Project restored
 */
router.patch('/:projectId/restore', authenticateToken, requirePermission('mrv:projects:write'),
  mrvAuditEvent({ action: 'PROJECT_RESTORED', entityType: 'MRVProject', getEntityId: (req) => req.params.projectId }),
  async (req, res) => {
    try {
      const project = await MRVProject.findOne({ projectId: req.params.projectId, deletedAt: { $ne: null } }).lean();
      if (!project) return res.status(404).json({ error: 'Archived MRV project not found' });
      if (!canManageProjectArchive(project, req.user)) {
        return res.status(403).json({ error: 'Only an MRV project manager or programme admin can restore this project.' });
      }
      const now = new Date();
      const updated = await MRVProject.findOneAndUpdate(
        { projectId: req.params.projectId },
        {
          $set: { restoredAt: now, restoredBy: req.user?.userid || req.user?._id?.toString(), updatedAt: now },
          $unset: { deletedAt: '', deletedBy: '', deleteReason: '' },
        },
        { new: true },
      ).lean();
      res.json({ success: true, data: { ...updated, archived: false, actionState: mrvProjectActionState(updated), nextAction: mrvProjectNextAction(updated) } });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

/**
 * @swagger
 * /api/mrv/projects/{projectId}/sites:
 *   get:
 *     summary: List all sites for an MRV project
 *     tags: [MRV Engine - Projects]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of project sites
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/MRVSite' }
 */
router.get('/:projectId/sites', authenticateToken, requirePermission('mrv:projects:read'), verifyMRVProjectAccess(), async (req, res) => {
  try {
    const sites = await MRVSite.find({ projectId: req.params.projectId, deletedAt: null }).lean();
    res.json({ success: true, data: sites });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/sites:
 *   post:
 *     summary: Add a new site to an MRV project
 *     tags: [MRV Engine - Projects]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateSiteRequest' }
 *     responses:
 *       201:
 *         description: Site created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/MRVSite' }
 *       403:
 *         description: Insufficient role — requires mrv-project-manager or mrv-programme-admin
 */
router.post('/:projectId/sites', authenticateToken,
  requirePermission('mrv:projects:write'),
  verifyMRVProjectAccess(['mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'SITE_CREATED', entityType: 'MRVSite', getEntityId: (req, body) => body?.data?.siteId }),
  async (req, res) => {
  try {
    const siteId = `SITE-${uuidv4()}`;
    const site = await MRVSite.create({ siteId, projectId: req.params.projectId, organizationId: req.mrvProject.organizationId, ...req.body, createdBy: req.user?.userid });
    res.status(201).json({ success: true, data: site });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Partners ───────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/mrv/projects/{projectId}/partners:
 *   get:
 *     summary: List project partners (Foovante Global, VVBs, etc.)
 *     tags: [MRV Engine - Projects]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of partners
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: '#/components/schemas/MRVProjectPartner' } }
 */
router.get('/:projectId/partners', authenticateToken, requirePermission('mrv:projects:read'), verifyMRVProjectAccess(), async (req, res) => {
  try {
    const partners = await MRVProjectPartner.find({ projectId: req.params.projectId }).lean();
    res.json({ success: true, data: partners });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/partners:
 *   post:
 *     summary: Add a partner to the project (e.g. Foovante Global as PROJECT_DEVELOPER)
 *     tags: [MRV Engine - Projects]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreatePartnerRequest' }
 *           examples:
 *             foovante:
 *               summary: Foovante Global as project developer
 *               value:
 *                 organizationName: "Foovante Global"
 *                 roles: [PROJECT_DEVELOPER, STAKEHOLDER_ENGAGEMENT, REGULATORY_COORDINATION]
 *                 agreementStatus: DRAFT
 *                 contacts:
 *                   - name: "Foovante Contact"
 *                     role: "Project Director"
 *                     email: "contact@foovante.com"
 *                 epaRelationshipType: "EPA_AIR_QUALITY_DATA_PARTNERSHIP"
 *                 epaRelationshipNote: "Data partnership with EPA Ghana — NOT a carbon-market approval"
 *     responses:
 *       201:
 *         description: Partner added
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/MRVProjectPartner' }
 */
router.post('/:projectId/partners', authenticateToken,
  requirePermission('mrv:projects:write'),
  verifyMRVProjectAccess(['mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'PARTNER_ADDED', entityType: 'MRVProjectPartner', getEntityId: (req, body) => body?.data?.partnerId }),
  async (req, res) => {
  try {
    const partner = await MRVProjectPartner.create({ partnerId: `PTNR-${uuidv4()}`, projectId: req.params.projectId, ...req.body, createdBy: req.user?.userid });
    res.status(201).json({ success: true, data: partner });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Methodology Assignments ───────────────────────────────────────────────

/**
 * @swagger
 * /api/mrv/projects/{projectId}/methodology-assignments:
 *   get:
 *     summary: List methodology assignments for a project
 *     tags: [MRV Engine - Projects]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Methodology assignments
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { type: object } }
 */
router.get('/:projectId/methodology-assignments', authenticateToken, requirePermission('mrv:projects:read'), verifyMRVProjectAccess(), async (req, res) => {
  try {
    const assignments = await ProjectMethodologyAssignment.find({ projectId: req.params.projectId }).lean();
    res.json({ success: true, data: assignments });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/methodology-assignments:
 *   post:
 *     summary: Assign a methodology candidate to a project
 *     description: Links an implementation record to this project for monitoring. Requires role `mrv-methodology-manager`, `mrv-project-manager`, or `mrv-programme-admin`.
 *     tags: [MRV Engine - Projects]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [implementationId, methodologyVersionId]
 *             properties:
 *               implementationId: { type: string, example: CC-VERRA-VM0050-1.0-1.0.0 }
 *               methodologyVersionId: { type: string, example: VERRA-VM0050-1.0 }
 *               methodologyId: { type: string, example: VERRA-VM0050 }
 *               standardVersionId: { type: string, example: VERRA-VCS-5.0 }
 *               applicabilityStatus: { type: string, enum: [CANDIDATE, UNDER_REVIEW, CONFIRMED, REJECTED], default: CANDIDATE }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Assignment created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: object }
 */
router.post('/:projectId/methodology-assignments', authenticateToken,
  requirePermission('mrv:projects:write'),
  verifyMRVProjectAccess(['mrv-methodology-manager', 'mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'METHODOLOGY_ASSIGNED', entityType: 'ProjectMethodologyAssignment', getEntityId: (req, body) => body?.data?.assignmentId }),
  async (req, res) => {
  try {
    const assignment = await ProjectMethodologyAssignment.create({ assignmentId: `ASGN-${uuidv4()}`, projectId: req.params.projectId, ...req.body, selectedAt: new Date(), selectedBy: req.user?.userid });
    res.status(201).json({ success: true, data: assignment });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Members ───────────────────────────────────────────────────────────────


/**
 * @swagger
 * /api/mrv/projects/{projectId}/team/invite:
 *   post:
 *     summary: Invite or assign a team member to an MRV project by email
 *     description: Existing Crafted Climate users are added to the workspace/project immediately. New users receive an invitation email that preserves the requested workspace and MRV role.
 *     tags: [MRV Engine - Projects]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, mrvRole]
 *             properties:
 *               email: { type: string, format: email }
 *               mrvRole: { type: string, enum: [mrv-project-manager, mrv-field-officer, mrv-data-reviewer, mrv-methodology-manager, mrv-report-manager, mrv-independent-verifier, mrv-programme-admin, mrv-auditor] }
 *               orgRole: { type: string, enum: [org-admin, org-support, org-user, viewer, editor] }
 *     responses:
 *       200:
 *         description: Existing user assigned to the project
 *       201:
 *         description: Invitation recorded and email queued
 */
router.post('/:projectId/team/invite', authenticateToken,
  requirePermission('mrv:projects:write'),
  verifyMRVProjectAccess(['mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'TEAM_MEMBER_INVITED', entityType: 'MRVProject', getEntityId: (req) => req.params.projectId }),
  async (req, res) => {
    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      const mrvRole = req.body.mrvRole || req.body.role;
      const orgRole = req.body.orgRole || 'org-user';

      if (!email || !email.includes('@')) return res.status(400).json({ error: 'A valid email address is required' });
      if (!MRV_ROLES.includes(mrvRole)) return res.status(400).json({ error: 'A valid MRV project role is required' });
      if (!ORG_ROLES.includes(orgRole)) return res.status(400).json({ error: 'A valid workspace role is required' });

      const project = await MRVProject.findOne({ projectId: req.params.projectId, deletedAt: null });
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const org = await Organization.findOne({ organizationId: project.organizationId, deletedAt: null });
      if (!org) return res.status(404).json({ error: 'Organization not found' });

      const invitee = await User.findOne({ email }).lean();
      const inviterName = userDisplayName(req.user) || req.user?.username || req.user?.email || 'Crafted Climate';

      if (invitee?.userid) {
        const isOrgMember = org.collaborators.some((member) => member.userid === invitee.userid);
        if (!isOrgMember) {
          org.collaborators.push({ userid: invitee.userid, role: orgRole, joinedAt: new Date(), permissions: [] });
          await org.save();
          await User.updateOne({ userid: invitee.userid }, { $addToSet: { organization: org.organizationId }, $set: { currentOrganizationId: org.organizationId } });
        }

        await MRVProject.updateOne({ projectId: project.projectId }, { $pull: { members: { userId: invitee.userid } } });
        const updated = await MRVProject.findOneAndUpdate(
          { projectId: project.projectId },
          { $addToSet: { members: { userId: invitee.userid, role: mrvRole, addedAt: new Date(), addedBy: req.user?.userid } } },
          { new: true },
        );

        const projectUrl = `${process.env.APP_URL || 'https://console.craftedclimate.co'}/mrv/projects/${project.projectId}/team`;
        await sendCCEmailSafe({
          type: 'org.invitation',
          to: email,
          vars: {
            orgName: org.name,
            inviteeName: userDisplayName(invitee),
            inviterName,
            role: `${orgRole} / ${mrvRole}`,
            acceptUrl: projectUrl,
            signupUrl: projectUrl,
            isNewUser: false,
            expiresAt: null,
          },
        });

        return res.json({ success: true, message: 'Existing user assigned to the MRV project', data: updated });
      }

      await MRVProjectInvitation.deleteMany({ projectId: project.projectId, email, accepted: false });
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const invitation = await MRVProjectInvitation.create({
        invitationId: `mrv-inv-${uuidv4()}`,
        token: uuidv4().replace(/-/g, ''),
        email,
        projectId: project.projectId,
        organizationId: org.organizationId,
        orgRole,
        mrvRole,
        needsSignUp: true,
        invitedBy: req.user?.userid,
        expiresAt,
      });

      const acceptUrl = `${process.env.APP_URL || 'https://console.craftedclimate.co'}/accept-invite?token=${invitation.token}&projectId=${project.projectId}`;
      const signupUrl = `${process.env.APP_URL || 'https://console.craftedclimate.co'}/signup?invitationId=${invitation.invitationId}&token=${invitation.token}`;
      await sendCCEmailSafe({
        type: 'org.invitation',
        to: email,
        vars: {
          orgName: org.name,
          inviteeName: email,
          inviterName,
          role: `${orgRole} / ${mrvRole}`,
          acceptUrl,
          signupUrl,
          isNewUser: true,
          expiresAt,
        },
      });

      res.status(201).json({
        success: true,
        message: 'Invitation sent. The MRV role will be applied when the user joins Crafted Climate.',
        data: {
          invitationId: invitation.invitationId,
          email: invitation.email,
          orgRole: invitation.orgRole,
          mrvRole: invitation.mrvRole,
          expiresAt: invitation.expiresAt,
          needsSignUp: true,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);
/**
 * @swagger
 * /api/mrv/projects/{projectId}/members:
 *   post:
 *     summary: Add a member to an MRV project with a specific role
 *     description: |
 *       Grants a user MRV project access. Available roles:
 *       - `mrv-project-manager` — full project management
 *       - `mrv-field-officer` — field data entry
 *       - `mrv-data-reviewer` — data quality review and approve/void
 *       - `mrv-methodology-manager` — methodology assignment
 *       - `mrv-report-manager` — reporting
 *       - `mrv-independent-verifier` — VVB role (external)
 *       - `mrv-programme-admin` — full programme administration
 *       - `mrv-auditor` — read-only audit log access
 *     tags: [MRV Engine - Projects]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, role]
 *             properties:
 *               userId: { type: string, description: "The user's userid from the auth system" }
 *               role:
 *                 type: string
 *                 enum: [mrv-project-manager, mrv-field-officer, mrv-data-reviewer, mrv-methodology-manager, mrv-report-manager, mrv-independent-verifier, mrv-programme-admin, mrv-auditor]
 *                 example: mrv-field-officer
 *     responses:
 *       200:
 *         description: Member added — returns updated project
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/MRVProject' }
 *       400:
 *         description: userId and role are required
 *       403:
 *         description: Requires mrv-project-manager or mrv-programme-admin
 */
router.post('/:projectId/members', authenticateToken,
  requirePermission('mrv:projects:write'),
  verifyMRVProjectAccess(['mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'MEMBER_ADDED', entityType: 'MRVProject', getEntityId: (req) => req.params.projectId }),
  async (req, res) => {
  try {
    const { userId, role } = req.body;
    if (!userId || !role) return res.status(400).json({ error: 'userId and role required' });
    const updated = await MRVProject.findOneAndUpdate({ projectId: req.params.projectId }, { $addToSet: { members: { userId, role, addedAt: new Date(), addedBy: req.user?.userid } } }, { new: true });
    res.json({ success: true, data: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Readiness ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/mrv/projects/{projectId}/readiness:
 *   get:
 *     summary: Get latest readiness assessment for a project
 *     description: Returns the most recent readiness assessment snapshot for a project (checks sensors, calibration, methodology sign-off, etc.)
 *     tags: [MRV Engine - Projects]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Latest readiness assessment (null if none run yet)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     readinessId: { type: string }
 *                     overallReady: { type: boolean }
 *                     checks: { type: array, items: { type: object } }
 *                     blockers: { type: array, items: { type: string } }
 *                     runAt: { type: string, format: date-time }
 */
router.get('/:projectId/readiness', authenticateToken, requirePermission('mrv:projects:read'), verifyMRVProjectAccess(), async (req, res) => {
  try {
    const result = await runReadinessAssessment(req.params.projectId);
    res.json({ success: true, data: result });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// ── Applicability Assessment ───────────────────────────────────────────────

/**
 * @swagger
 * /api/mrv/projects/{projectId}/applicability:
 *   post:
 *     summary: Run applicability assessment — does VM0050 apply to this project?
 *     description: |
 *       Runs 5 checks: methodology assignment, standard version, country eligibility,
 *       activity type match, and sensor capability match.
 *
 *       Returns one of:
 *       - `CONFIRMED` — all checks passed, project qualifies for VM0050
 *       - `CANDIDATE` — mostly passes with 1 advisory warning
 *       - `REQUIRES_REVIEW` — multiple warnings, manual VVB review needed
 *       - `NOT_APPLICABLE` — hard blocker (e.g. country not approved)
 *
 *       Result is persisted to the project record.
 *     tags: [MRV Engine - Projects]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Assessment complete
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     applicabilityStatus: { type: string, enum: [CONFIRMED, CANDIDATE, REQUIRES_REVIEW, NOT_APPLICABLE] }
 *                     assessedAt: { type: string, format: date-time }
 *                     checks: { type: array, items: { type: object } }
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total: { type: integer }
 *                         passed: { type: integer }
 *                         blockers: { type: array, items: { type: string } }
 *                         warnings: { type: array, items: { type: string } }
 */
router.post('/:projectId/applicability', authenticateToken,
  requirePermission('mrv:projects:write'),
  verifyMRVProjectAccess(['mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'APPLICABILITY_ASSESSED', entityType: 'MRVProject', getEntityId: (req) => req.params.projectId }),
  async (req, res) => {
  try {
    const result = await runApplicabilityAssessment(req.params.projectId);
    res.json({ success: true, data: result });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/applicability:
 *   get:
 *     summary: Get the latest applicability assessment result
 *     tags: [MRV Engine - Projects]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Latest applicability assessment result from the project record
 */
router.get('/:projectId/applicability', authenticateToken, requirePermission('mrv:projects:read'), verifyMRVProjectAccess(), async (req, res) => {
  try {
    const project = await MRVProject.findOne(
      { projectId: req.params.projectId },
      { applicabilityStatus: 1, applicabilityAssessedAt: 1, applicabilityChecks: 1 }
    ).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({
      success: true,
      data: {
        applicabilityStatus:  project.applicabilityStatus  || null,
        assessedAt:           project.applicabilityAssessedAt || null,
        checks:               project.applicabilityChecks  || [],
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/readiness:
 *   post:
 *     summary: Run readiness assessment — is this project ready to open a monitoring period?
 *     description: |
 *       Runs 6 checks: applicability confirmed, active installations, calibration validity,
 *       methodology assignment approved, no open monitoring period, field team member present.
 *
 *       Returns `overallReady: true/false` plus a list of blockers and warnings.
 *       Result is persisted to the project record.
 *     tags: [MRV Engine - Projects]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Readiness assessment complete
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     overallReady: { type: boolean }
 *                     readinessStatus: { type: string, enum: [READY, NOT_READY] }
 *                     assessedAt: { type: string, format: date-time }
 *                     checks: { type: array, items: { type: object } }
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total: { type: integer }
 *                         passed: { type: integer }
 *                         blockers: { type: array, items: { type: string } }
 *                         warnings: { type: array, items: { type: string } }
 */
router.post('/:projectId/readiness', authenticateToken,
  requirePermission('mrv:projects:write'),
  verifyMRVProjectAccess(['mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'READINESS_ASSESSED', entityType: 'MRVProject', getEntityId: (req) => req.params.projectId }),
  async (req, res) => {
  try {
    const result = await runReadinessAssessment(req.params.projectId);
    res.json({ success: true, data: result });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

module.exports = router;
