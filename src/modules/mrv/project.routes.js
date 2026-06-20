'use strict';
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const authenticateToken = require('../../middleware/bearermiddleware');
const { verifyMRVProjectAccess, requireMRVFeatureEnabled } = require('../../middleware/mrv/verifyMRVProjectAccess');
const { mrvAuditEvent } = require('../../middleware/mrv/mrvAuditEvent');
const MRVProject = require('../../models/mrv/project/MRVProject.model');
const MRVSite = require('../../models/mrv/project/MRVSite.model');
const MRVProjectPartner = require('../../models/mrv/project/MRVProjectPartner.model');
const ProjectMethodologyAssignment = require('../../models/mrv/project/ProjectMethodologyAssignment.model');
const ReadinessAssessment = require('../../models/mrv/project/ReadinessAssessment.model');
const Organization = require('../../models/organization/organizationModel');
const { runApplicabilityAssessment } = require('../../services/mrv/mrvApplicabilityService');
const { runReadinessAssessment }     = require('../../services/mrv/mrvReadinessService');

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
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const orgId = req.query.organizationId;
    if (!orgId) return res.status(400).json({ error: 'organizationId query param required' });
    const filter = { organizationId: orgId, deletedAt: null };
    if (user.platformRole !== 'admin') {
      filter['members.userId'] = user.userid || user._id?.toString();
    }
    if (req.query.status) filter.status = req.query.status;
    const projects = await MRVProject.find(filter).lean();
    res.json({ success: true, data: projects });
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
router.post('/', authenticateToken, requireMRVFeatureEnabled,
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
router.get('/:projectId', authenticateToken, verifyMRVProjectAccess(), async (req, res) => {
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
router.patch('/:projectId', authenticateToken, verifyMRVProjectAccess(['mrv-project-manager', 'mrv-programme-admin']),
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
router.get('/:projectId/sites', authenticateToken, verifyMRVProjectAccess(), async (req, res) => {
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
router.get('/:projectId/partners', authenticateToken, verifyMRVProjectAccess(), async (req, res) => {
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
router.get('/:projectId/methodology-assignments', authenticateToken, verifyMRVProjectAccess(), async (req, res) => {
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
router.get('/:projectId/readiness', authenticateToken, verifyMRVProjectAccess(), async (req, res) => {
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
router.get('/:projectId/applicability', authenticateToken, verifyMRVProjectAccess(), async (req, res) => {
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
  verifyMRVProjectAccess(['mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'READINESS_ASSESSED', entityType: 'MRVProject', getEntityId: (req) => req.params.projectId }),
  async (req, res) => {
  try {
    const result = await runReadinessAssessment(req.params.projectId);
    res.json({ success: true, data: result });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

module.exports = router;
