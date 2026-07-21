'use strict';
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const authenticateToken = require('../../middleware/bearermiddleware');
const { verifyMRVProjectAccess } = require('../../middleware/mrv/verifyMRVProjectAccess');
const { mrvAuditEvent } = require('../../middleware/mrv/mrvAuditEvent');
const VerificationCase = require('../../models/mrv/assurance/VerificationCase.model');
const VerificationFinding = require('../../models/mrv/assurance/VerificationFinding.model');
const RegistryEvent = require('../../models/mrv/assurance/RegistryEvent.model');
const MRVAuditEvent = require('../../models/mrv/assurance/MRVAuditEvent.model');
const ExternalEvidenceRecord = require('../../models/mrv/evidence/ExternalEvidenceRecord.model');
const MRVObservation = require('../../models/mrv/evidence/MRVObservation.model');
const SensorInstallation = require('../../models/mrv/evidence/SensorInstallation.model');
const CalibrationRecord = require('../../models/mrv/evidence/CalibrationRecord.model');
const MonitoringPeriod = require('../../models/mrv/monitoring/MonitoringPeriod.model');
const CalculationRun = require('../../models/mrv/accounting/CalculationRun.model');
const MRVReport = require('../../models/mrv/outbound/MRVReport.model');

// ── Verification Cases ────────────────────────────────────────────────────

/**
 * @swagger
 * /api/mrv/projects/{projectId}/verification-cases:
 *   get:
 *     summary: List VVB verification cases for a project
 *     description: Returns all validation and verification cases opened against this project.
 *     tags: [MRV Engine - Assurance and Audit]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Verification cases
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/VerificationCase' }
 */
router.get('/:projectId/verification-cases', authenticateToken, verifyMRVProjectAccess(), async (req, res) => {
  try {
    const cases = await VerificationCase.find({ projectId: req.params.projectId }).lean();
    res.json({ success: true, data: cases });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/verification-cases:
 *   post:
 *     summary: Open a new VVB verification or validation case
 *     description: |
 *       Creates a verification case to track the VVB engagement lifecycle.
 *       Requires role: `mrv-project-manager` or `mrv-programme-admin`.
 *
 *       **Scope options:**
 *       - `VALIDATION` — project design document review (before monitoring starts)
 *       - `VERIFICATION` — monitoring data review (after monitoring period closes)
 *       - `COMBINED` — both validation and verification in one engagement
 *     tags: [MRV Engine - Assurance and Audit]
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
 *           schema: { $ref: '#/components/schemas/CreateVerificationCaseRequest' }
 *           examples:
 *             validation:
 *               summary: Open a validation case with Bureau Veritas
 *               value:
 *                 scope: VALIDATION
 *                 vvbOrganizationName: Bureau Veritas
 *                 vvbContactName: Lead Verifier
 *                 vvbContactEmail: verifier@bureauveritas.com
 *     responses:
 *       201:
 *         description: Verification case opened in OPEN status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/VerificationCase' }
 *       400: { description: scope is required }
 *       403: { description: Requires mrv-project-manager or mrv-programme-admin }
 */
router.post('/:projectId/verification-cases', authenticateToken,
  verifyMRVProjectAccess(['mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'VERIFICATION_CASE_CREATED', entityType: 'VerificationCase', getEntityId: (req, body) => body?.data?.caseId }),
  async (req, res) => {
  try {
    const { scope, vvbOrganizationName, vvbContactName, vvbContactEmail, reportId, calculationRunId } = req.body;
    if (!scope) return res.status(400).json({ error: 'scope is required (VALIDATION | VERIFICATION | COMBINED)' });
    const vc = await VerificationCase.create({ caseId: `VVC-${uuidv4()}`, projectId: req.params.projectId, organizationId: req.mrvProject.organizationId, scope, vvbOrganizationName, vvbContactName, vvbContactEmail, reportId, calculationRunId, openedBy: req.user?.userid });
    res.status(201).json({ success: true, data: vc });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/verification-cases/{caseId}/context:
 *   get:
 *     summary: Get verifier review context for a verification case
 *     description: Returns a read-only project data room snapshot for the selected verification case, including linked report, calculation run, evidence files, observations, installations, calibrations, monitoring periods, and findings.
 *     tags: [MRV Engine - Assurance and Audit]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Verification case context
 *       404:
 *         description: Verification case not found
 */
router.get('/:projectId/verification-cases/:caseId/context', authenticateToken, verifyMRVProjectAccess(), async (req, res) => {
  try {
    const { projectId, caseId } = req.params;
    const verificationCase = await VerificationCase.findOne({ projectId, caseId }).lean();
    if (!verificationCase) return res.status(404).json({ error: 'Verification case not found' });

    const [findings, periods, evidenceFiles, observations, installations, calibrations, registryEvents] = await Promise.all([
      VerificationFinding.find({ projectId, caseId }).lean(),
      MonitoringPeriod.find({ projectId }).lean(),
      ExternalEvidenceRecord.find({ projectId }).select('-largeFileUploadToken').lean(),
      MRVObservation.find({ projectId }).sort({ observedAt: -1 }).limit(500).lean(),
      SensorInstallation.find({ projectId }).lean(),
      CalibrationRecord.find({ projectId }).lean(),
      RegistryEvent.find({ projectId }).lean()
    ]);

    const report = verificationCase.reportId
      ? await MRVReport.findOne({ projectId, reportId: verificationCase.reportId }).lean()
      : await MRVReport.findOne({ projectId }).sort({ reportVersion: -1 }).lean();
    const calculationRun = verificationCase.calculationRunId
      ? await CalculationRun.findOne({ projectId, calculationRunId: verificationCase.calculationRunId }).lean()
      : report?.monitoringPeriodId
        ? await CalculationRun.findOne({ projectId, monitoringPeriodId: report.monitoringPeriodId }).sort({ runVersion: -1 }).lean()
        : await CalculationRun.findOne({ projectId }).sort({ _id: -1 }).lean();

    const observationSummary = observations.reduce((acc, obs) => {
      const key = obs.qualityStatus || 'UNKNOWN';
      acc[key] = (acc[key] || 0) + 1;
      acc.total += 1;
      return acc;
    }, { total: 0 });

    res.json({ success: true, data: {
      generatedAt: new Date().toISOString(),
      verificationCase,
      findings,
      report,
      calculationRun,
      monitoringPeriods: periods,
      evidenceFiles,
      observations: { count: observations.length, summary: observationSummary, records: observations },
      installations,
      calibrations,
      registryEvents
    } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Findings ──────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/mrv/projects/{projectId}/verification-cases/{caseId}/findings:
 *   get:
 *     summary: List findings for a verification case
 *     tags: [MRV Engine - Assurance and Audit]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Verification findings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { type: object } }
 */
router.get('/:projectId/verification-cases/:caseId/findings', authenticateToken, verifyMRVProjectAccess(), async (req, res) => {
  try {
    const findings = await VerificationFinding.find({ caseId: req.params.caseId, projectId: req.params.projectId }).lean();
    res.json({ success: true, data: findings });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/verification-cases/{caseId}/findings:
 *   post:
 *     summary: Record a VVB finding (CAR, FAR, or observation)
 *     description: |
 *       The VVB raises a finding against the project. Severity types:
 *       - `CORRECTIVE_ACTION_REQUEST (CAR)` — must be resolved before a positive opinion
 *       - `FORWARD_ACTION_REQUEST (FAR)` — for the next monitoring period
 *       - `MINOR` — minor issue requiring acknowledgement
 *       - `MAJOR` — significant issue
 *       - `OBSERVATION` — informational only
 *
 *       Requires role: `mrv-independent-verifier` or `mrv-programme-admin`.
 *     tags: [MRV Engine - Assurance and Audit]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateFindingRequest' }
 *     responses:
 *       201:
 *         description: Finding created and linked to the case
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: object }
 *       400: { description: severity and description required }
 *       403: { description: Requires mrv-independent-verifier or mrv-programme-admin }
 */
router.post('/:projectId/verification-cases/:caseId/findings', authenticateToken,
  verifyMRVProjectAccess(['mrv-independent-verifier', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'VERIFICATION_FINDING_RAISED', entityType: 'VerificationFinding', getEntityId: (req, body) => body?.data?.findingId }),
  async (req, res) => {
  try {
    const { severity, category, description, affectedEntities } = req.body;
    if (!severity || !description) return res.status(400).json({ error: 'severity and description required' });
    const finding = await VerificationFinding.create({ findingId: `FIND-${uuidv4()}`, caseId: req.params.caseId, projectId: req.params.projectId, severity, category, description, affectedEntities: affectedEntities || [], raisedBy: req.user?.userid });
    await VerificationCase.findOneAndUpdate({ caseId: req.params.caseId }, { $addToSet: { findings: finding.findingId }, $set: { status: 'FINDINGS_RAISED' } });
    res.status(201).json({ success: true, data: finding });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/verification-cases/{caseId}/opinion:
 *   post:
 *     summary: Record the verification opinion and close the case
 *     description: |
 *       The VVB issues their final opinion. Transitions the case to `OPINION_RECORDED`.
 *       Requires role: `mrv-independent-verifier` or `mrv-programme-admin`.
 *
 *       **Opinion types:**
 *       - `POSITIVE` — unqualified positive verification opinion
 *       - `POSITIVE_WITH_QUALIFICATIONS` — positive with conditions
 *       - `ADVERSE` — negative opinion
 *       - `DISCLAIMER` — unable to form an opinion
 *     tags: [MRV Engine - Assurance and Audit]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [opinion]
 *             properties:
 *               opinion:
 *                 type: string
 *                 enum: [POSITIVE, POSITIVE_WITH_QUALIFICATIONS, ADVERSE, DISCLAIMER]
 *                 example: POSITIVE
 *               notes: { type: string }
 *               reportEvidenceId: { type: string, description: "evidenceId of the uploaded verification report PDF" }
 *     responses:
 *       200:
 *         description: Verification opinion recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/VerificationCase' }
 *       400: { description: opinion is required }
 *       404: { description: Case not found }
 */
router.post('/:projectId/verification-cases/:caseId/opinion', authenticateToken,
  verifyMRVProjectAccess(['mrv-independent-verifier', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'VERIFICATION_OPINION_SUBMITTED', entityType: 'VerificationCase', getEntityId: (req) => req.params.caseId }),
  async (req, res) => {
  try {
    const { opinion, notes, reportEvidenceId } = req.body;
    if (!opinion) return res.status(400).json({ error: 'opinion is required' });
    const vc = await VerificationCase.findOneAndUpdate(
      { caseId: req.params.caseId, projectId: req.params.projectId },
      { $set: { status: 'OPINION_RECORDED', verificationOpinion: { opinion, notes, reportEvidenceId, recordedAt: new Date(), recordedBy: req.user?.userid } } },
      { new: true }
    );
    if (!vc) return res.status(404).json({ error: 'Verification case not found' });
    res.json({ success: true, data: vc });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Registry Events ───────────────────────────────────────────────────────

/**
 * @swagger
 * /api/mrv/projects/{projectId}/registry-events:
 *   get:
 *     summary: List official registry events for a project (Verra, Ghana CMO, etc.)
 *     description: Returns a chronological log of all registry milestones — submissions, approvals, VCU issuances, CMO authorisations.
 *     tags: [MRV Engine - Assurance and Audit]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Registry events sorted by eventDate descending
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { type: object } }
 */
router.get('/:projectId/registry-events', authenticateToken, verifyMRVProjectAccess(), async (req, res) => {
  try {
    const events = await RegistryEvent.find({ projectId: req.params.projectId }).lean();
    events.sort((a, b) => new Date(b.eventDate || b.createdAt || 0) - new Date(a.eventDate || a.createdAt || 0));
    res.json({ success: true, data: events });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/registry-events:
 *   post:
 *     summary: Record an official registry event
 *     description: |
 *       Logs a registry milestone. Attach evidence files (previously uploaded via `/evidence/upload`)
 *       using `evidenceIds`. Requires role: `mrv-project-manager` or `mrv-programme-admin`.
 *     tags: [MRV Engine - Assurance and Audit]
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
 *           schema: { $ref: '#/components/schemas/RegistryEventRequest' }
 *           examples:
 *             vcs_registration:
 *               summary: Verra project registration submitted
 *               value:
 *                 registry: VERRA_VCS
 *                 eventType: PROJECT_REGISTRATION_SUBMITTED
 *                 eventDate: "2026-06-18"
 *                 description: "Project description document submitted to Verra registry"
 *                 externalRef: VCS-2026-GH-001
 *             ghana_cmo:
 *               summary: Ghana CMO authorisation submitted
 *               value:
 *                 registry: GHANA_CMO
 *                 eventType: CMO_AUTHORISATION_SUBMITTED
 *                 eventDate: "2026-06-18"
 *                 description: "CMO pathway application submitted to Ghana EPA"
 *     responses:
 *       201:
 *         description: Registry event recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: object }
 *       400: { description: registry, eventType, eventDate are required }
 */
router.post('/:projectId/registry-events', authenticateToken,
  verifyMRVProjectAccess(['mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'REGISTRY_EVENT_RECORDED', entityType: 'RegistryEvent', getEntityId: (req, body) => body?.data?.eventId }),
  async (req, res) => {
  try {
    const { registry, eventType, eventDate, description, externalRef, evidenceIds } = req.body;
    if (!registry || !eventType || !eventDate) return res.status(400).json({ error: 'registry, eventType, eventDate are required' });
    const event = await RegistryEvent.create({ eventId: `RCEV-${uuidv4()}`, projectId: req.params.projectId, organizationId: req.mrvProject.organizationId, registry, eventType, eventDate: new Date(eventDate), description, externalRef, evidenceIds: evidenceIds || [], recordedBy: req.user?.userid });
    res.status(201).json({ success: true, data: event });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Audit Log ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/mrv/projects/{projectId}/audit-log:
 *   get:
 *     summary: View the immutable MRV audit trail for a project
 *     description: |
 *       Returns a chronological log of all state changes, access events, and user actions for this project.
 *       The audit log is append-only and tamper-evident (each event stores a SHA-256 hash of the state change).
 *
 *       Requires role: `mrv-project-manager`, `mrv-programme-admin`, or `mrv-auditor`.
 *     tags: [MRV Engine - Assurance and Audit]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100 }
 *     responses:
 *       200:
 *         description: Audit log entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       eventId: { type: string }
 *                       action: { type: string, example: PROJECT_CREATED }
 *                       entityType: { type: string }
 *                       actorId: { type: string }
 *                       actorRole: { type: string }
 *                       occurredAt: { type: string, format: date-time }
 *                       newStateHash: { type: string }
 *                 pagination: { type: object }
 *       403: { description: Requires mrv-project-manager, mrv-programme-admin, or mrv-auditor }
 */
router.get('/:projectId/audit-log', authenticateToken, verifyMRVProjectAccess(['mrv-project-manager', 'mrv-programme-admin', 'mrv-auditor']), async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [events, total] = await Promise.all([
      MRVAuditEvent.find({ projectId: req.params.projectId }).lean(),
      MRVAuditEvent.countDocuments({ projectId: req.params.projectId })
    ]);
    events.sort((a, b) => new Date(b.occurredAt || b.createdAt || 0) - new Date(a.occurredAt || a.createdAt || 0));
    const paged = events.slice(skip, skip + parseInt(limit));
    res.json({ success: true, data: paged, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
