'use strict';
const router = require('express').Router();
const { Queue } = require('bullmq');
const { randomUUID } = require('crypto');
const authenticateToken = require('../../middleware/bearermiddleware');
const { requirePermission } = require('../../middleware/authenticateApiKey');
const { verifyMRVProjectAccess } = require('../../middleware/mrv/verifyMRVProjectAccess');
const { mrvAuditEvent } = require('../../middleware/mrv/mrvAuditEvent');
const MRVObservation = require('../../models/mrv/evidence/MRVObservation.model');
const TelemetryReceipt = require('../../models/mrv/evidence/TelemetryReceipt.model');
const MRVValidationRun = require('../../models/mrv/evidence/MRVValidationRun.model');
const { mrvValidationQueue } = require('../../workers/mrv/queues');
const { extractObservationPayload } = require('../../services/mrv/mrvObservationExtractionService');
const { publishMRVProjectEvent } = require('../../config/socket/socketio');

function openObservationQueue() {
  return new Queue('mrv-observation', {
    connection: {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      keepAlive: 30000,
      maxRetriesPerRequest: null
    }
  });
}

const repairJobs = new Map();
const REPAIR_JOB_TTL_MS = 60 * 60 * 1000;

function hasEmptyMeasurements(observation) {
  return Object.keys(observation.measurements || {}).length === 0;
}

function publicRepairJob(job) {
  if (!job) return null;
  return {
    jobId: job.jobId,
    projectId: job.projectId,
    auid: job.auid || null,
    status: job.status,
    phase: job.phase,
    limit: job.limit,
    scanned: job.scanned,
    candidates: job.candidates,
    processed: job.processed,
    repaired: job.repaired,
    requeued: job.requeued,
    skipped: job.skipped,
    errors: job.errors.slice(-20),
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt || null,
    progressPercent: job.candidates > 0 ? Math.round((job.processed / job.candidates) * 100) : (job.status === 'completed' ? 100 : 0)
  };
}


function emitRepairProgress(job) {
  publishMRVProjectEvent(job.projectId, 'mrv:repair-progress', publicRepairJob(job));
}

function pruneRepairJobs() {
  const now = Date.now();
  for (const [jobId, job] of repairJobs.entries()) {
    if (now - new Date(job.updatedAt).getTime() > REPAIR_JOB_TTL_MS) repairJobs.delete(jobId);
  }
}

async function runEmptyMeasurementRepairJob(jobId) {
  const job = repairJobs.get(jobId);
  if (!job) return;
  const observationQueue = openObservationQueue();
  try {
    job.status = 'running';
    job.phase = 'Scanning observations';
    job.updatedAt = new Date().toISOString();
    emitRepairProgress(job);

    const filter = { projectId: job.projectId };
    if (job.auid) filter.auid = job.auid;
    const candidates = await MRVObservation.find(filter).select('observationId ingestionId measurements monitoringPeriodId projectId auid observedAt receivedAt createdAt').lean();
    candidates.sort((a, b) => new Date(b.observedAt || b.receivedAt || b.createdAt || 0) - new Date(a.observedAt || a.receivedAt || a.createdAt || 0));
    const emptyRows = candidates.filter(hasEmptyMeasurements).slice(0, job.limit);

    job.scanned = candidates.length;
    job.candidates = emptyRows.length;
    job.phase = emptyRows.length ? 'Repairing empty observations' : 'No empty observations found';
    job.updatedAt = new Date().toISOString();
    emitRepairProgress(job);

    for (const observation of emptyRows) {
      try {
        const retainedJob = await observationQueue.getJob(`obs-${observation.ingestionId}`);
        const envelope = retainedJob?.data?.envelope;
        if (!envelope) {
          job.skipped += 1;
          job.errors.push({ observationId: observation.observationId, reason: 'MRV observation job envelope is no longer retained' });
        } else {
          const { measurements, derivedValues, monitoringPeriodId } = extractObservationPayload(envelope);
          if (Object.keys(measurements).length === 0) {
            job.skipped += 1;
            job.errors.push({ observationId: observation.observationId, reason: 'Envelope did not contain numeric measurements' });
          } else {
            await MRVObservation.findOneAndUpdate(
              { observationId: observation.observationId, projectId: job.projectId },
              { $set: { measurements, derivedValues, monitoringPeriodId: observation.monitoringPeriodId || monitoringPeriodId || null, qualityStatus: 'PENDING', qualityWarnings: [] } }
            );
            await mrvValidationQueue.add('validation', { observationId: observation.observationId, ingestionId: observation.ingestionId }, {
              jobId: `repair-val-${observation.observationId}-${Date.now()}`,
              attempts: 3,
              backoff: { type: 'exponential', delay: 1000 }
            });
            job.repaired += 1;
            job.requeued += 1;
          }
        }
      } catch (itemErr) {
        job.errors.push({ observationId: observation.observationId, reason: itemErr.message });
      } finally {
        job.processed += 1;
        job.updatedAt = new Date().toISOString();
        emitRepairProgress(job);
      }
    }

    job.status = 'completed';
    job.phase = 'Completed';
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;
    emitRepairProgress(job);
  } catch (err) {
    job.status = 'failed';
    job.phase = 'Failed';
    job.errors.push({ reason: err.message });
    job.updatedAt = new Date().toISOString();
    emitRepairProgress(job);
  } finally {
    await observationQueue.close();
  }
}
/**
 * @swagger
 * /api/mrv/projects/{projectId}/data-quality/summary:
 *   get:
 *     summary: Get data quality summary statistics for a project or monitoring period
 *     description: Returns counts by quality status and the overall completeness ratio.
 *     tags: [MRV Engine - Data Quality]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: monitoringPeriodId
 *         schema: { type: string }
 *         description: Scope to a specific monitoring period
 *     responses:
 *       200:
 *         description: Data quality summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     total: { type: integer, example: 1440 }
 *                     accepted: { type: integer, example: 1380 }
 *                     acceptedWithWarning: { type: integer, example: 32 }
 *                     quarantined: { type: integer, example: 20 }
 *                     rejected: { type: integer, example: 5 }
 *                     voided: { type: integer, example: 3 }
 *                     manuallyApproved: { type: integer, example: 0 }
 *                     usable: { type: integer, example: 1412 }
 *                     completenessRatio: { type: number, format: float, example: 0.9806 }
 */
router.get('/:projectId/data-quality/summary', authenticateToken, requirePermission('mrv:data-quality:read'), verifyMRVProjectAccess(), async (req, res) => {
  try {
    const filter = { projectId: req.params.projectId };
    if (req.query.monitoringPeriodId) filter.monitoringPeriodId = req.query.monitoringPeriodId;
    const [total, accepted, acceptedWithWarning, quarantined, rejected, voided, manuallyApproved] = await Promise.all([
      MRVObservation.countDocuments(filter),
      MRVObservation.countDocuments({ ...filter, qualityStatus: 'ACCEPTED' }),
      MRVObservation.countDocuments({ ...filter, qualityStatus: 'ACCEPTED_WITH_WARNING' }),
      MRVObservation.countDocuments({ ...filter, qualityStatus: 'QUARANTINED' }),
      MRVObservation.countDocuments({ ...filter, qualityStatus: 'REJECTED' }),
      MRVObservation.countDocuments({ ...filter, qualityStatus: 'VOIDED' }),
      MRVObservation.countDocuments({ ...filter, qualityStatus: 'MANUALLY_APPROVED' })
    ]);
    const usable = accepted + acceptedWithWarning + manuallyApproved;
    res.json({ success: true, data: { total, accepted, acceptedWithWarning, quarantined, rejected, voided, manuallyApproved, usable, completenessRatio: total > 0 ? (usable / total) : 0 } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/data-quality/quarantined:
 *   get:
 *     summary: List quarantined observations awaiting manual review
 *     description: Returns observations that failed QA/QC validation and require a reviewer decision. Each row includes validation checks and telemetry receipt context where available.
 *     tags: [MRV Engine - Data Quality]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: monitoringPeriodId
 *         schema: { type: string }
 *       - in: query
 *         name: qualityStatus
 *         schema:
 *           type: string
 *           enum: [ALL, RECEIVED, USABLE, PENDING, ACCEPTED, ACCEPTED_WITH_WARNING, QUARANTINED, REJECTED, MANUALLY_APPROVED, SUBSTITUTED, SUPERSEDED, VOIDED]
 *         description: Filter observations by quality state. Defaults to QUARANTINED for backwards compatibility.
 *       - in: query
 *         name: auid
 *         schema: { type: string }
 *         description: Filter by linked device AUID.
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Quarantined observations
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MRVListResponse' }
 */
router.get('/:projectId/data-quality/quarantined', authenticateToken, requirePermission('mrv:data-quality:read'), verifyMRVProjectAccess(), async (req, res) => {
  try {
    const { monitoringPeriodId, auid } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
    const requestedStatus = String(req.query.qualityStatus || req.query.status || 'QUARANTINED').toUpperCase();
    const usableStatuses = ['ACCEPTED', 'ACCEPTED_WITH_WARNING', 'MANUALLY_APPROVED'];
    const statusFilterMap = {
      ALL: null,
      RECEIVED: null,
      USABLE: { $in: usableStatuses },
      ACCEPTED: 'ACCEPTED',
      ACCEPTED_WITH_WARNING: 'ACCEPTED_WITH_WARNING',
      QUARANTINED: 'QUARANTINED',
      PENDING: 'PENDING',
      REJECTED: 'REJECTED',
      MANUALLY_APPROVED: 'MANUALLY_APPROVED',
      SUBSTITUTED: 'SUBSTITUTED',
      SUPERSEDED: 'SUPERSEDED',
      VOIDED: 'VOIDED'
    };
    const filter = { projectId: req.params.projectId };
    if (statusFilterMap[requestedStatus] !== null && statusFilterMap[requestedStatus] !== undefined) filter.qualityStatus = statusFilterMap[requestedStatus];
    if (monitoringPeriodId) filter.monitoringPeriodId = monitoringPeriodId;
    if (auid) filter.auid = auid;
    const skip = (page - 1) * limit;
    const projectFilter = { projectId: req.params.projectId };
    if (monitoringPeriodId) projectFilter.monitoringPeriodId = monitoringPeriodId;
    const [obs, total, deviceAuids] = await Promise.all([
      MRVObservation.find(filter).lean(),
      MRVObservation.countDocuments(filter),
      MRVObservation.distinct('auid', projectFilter)
    ]);
    obs.sort((a, b) => new Date(b.observedAt || b.receivedAt || b.createdAt || 0) - new Date(a.observedAt || a.receivedAt || a.createdAt || 0));
    const paged = obs.slice(skip, skip + limit);
    const observationIds = paged.map((item) => item.observationId).filter(Boolean);
    const receiptIds = paged.map((item) => item.receiptId).filter(Boolean);
    const [validationRuns, receipts] = await Promise.all([
      observationIds.length ? MRVValidationRun.find({ observationId: { $in: observationIds } }).lean() : [],
      receiptIds.length ? TelemetryReceipt.find({ receiptId: { $in: receiptIds } }).lean() : []
    ]);
    validationRuns.sort((a, b) => new Date(b.runAt || 0) - new Date(a.runAt || 0));
    const validationByObservation = new Map();
    validationRuns.forEach((run) => {
      if (!validationByObservation.has(run.observationId)) validationByObservation.set(run.observationId, run);
    });
    const receiptById = new Map(receipts.map((receipt) => [receipt.receiptId, receipt]));
    const pageStatusCounts = paged.reduce((acc, item) => {
      acc[item.qualityStatus || 'UNKNOWN'] = (acc[item.qualityStatus || 'UNKNOWN'] || 0) + 1;
      return acc;
    }, {});
    const enriched = paged.map((item) => {
      const validationRun = validationByObservation.get(item.observationId) || null;
      const receipt = receiptById.get(item.receiptId) || null;
      const failedRule = validationRun?.checks?.find((check) => check.result === 'FAIL');
      const warningRule = validationRun?.checks?.find((check) => check.result === 'WARNING');
      const notQualified = item.qualificationResults?.find((result) => result.qualification === 'NOT_QUALIFIED');
      return {
        ...item,
        validationRun,
        validationChecks: validationRun?.checks || [],
        telemetryReceipt: receipt ? {
          receiptId: receipt.receiptId,
          ingestionId: receipt.ingestionId,
          status: receipt.status,
          transport: receipt.transport,
          receivedAt: receipt.receivedAt,
          observedAt: receipt.observedAt,
          timeSource: receipt.timeSource,
          clockQuality: receipt.clockQuality,
          rawBlobPath: receipt.rawBlobPath,
          rawBlobHash: receipt.rawBlobHash,
          rejectionReason: receipt.rejectionReason,
          quarantineReason: receipt.quarantineReason,
          firmwareVersion: receipt.firmwareVersion,
          schemaVersion: receipt.schemaVersion
        } : null,
        reviewReason: failedRule?.message || warningRule?.message || item.qualityWarnings?.[0] || notQualified?.reason || receipt?.quarantineReason || receipt?.rejectionReason || 'Requires reviewer decision'
      };
    });
    res.json({ success: true, data: enriched, pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNextPage: page * limit < total, hasPreviousPage: page > 1 }, filters: { qualityStatus: requestedStatus, appliedQualityFilter: filter.qualityStatus || 'ALL', auid: auid || null, devices: deviceAuids.filter(Boolean).sort(), pageStatusCounts } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});



/**
 * @swagger
 * /api/mrv/projects/{projectId}/data-quality/repair-empty-measurements/jobs:
 *   post:
 *     summary: Start an asynchronous empty-measurement repair job
 *     description: Starts a background repair that rehydrates empty MRV observations from retained queue envelopes and requeues validation. Use the returned jobId to poll progress.
 *     tags: [MRV Engine - Data Quality]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: auid
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 500, maximum: 2000 }
 *     responses:
 *       202:
 *         description: Repair job started
 */
router.post('/:projectId/data-quality/repair-empty-measurements/jobs', authenticateToken,
  requirePermission('mrv:data-quality:write'),
  verifyMRVProjectAccess(['mrv-data-reviewer', 'mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'OBSERVATION_MEASUREMENTS_REPAIR_STARTED', entityType: 'MRVObservation', getEntityId: (req) => req.params.projectId }),
  async (req, res) => {
    pruneRepairJobs();
    const jobId = `repair-${randomUUID()}`;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 2000);
    const now = new Date().toISOString();
    const job = {
      jobId,
      projectId: req.params.projectId,
      auid: req.query.auid || null,
      limit,
      status: 'queued',
      phase: 'Queued',
      scanned: 0,
      candidates: 0,
      processed: 0,
      repaired: 0,
      requeued: 0,
      skipped: 0,
      errors: [],
      startedAt: now,
      updatedAt: now,
      completedAt: null
    };
    repairJobs.set(jobId, job);
    emitRepairProgress(job);
    setImmediate(() => runEmptyMeasurementRepairJob(jobId));
    res.status(202).json({ success: true, data: publicRepairJob(job) });
  }
);

/**
 * @swagger
 * /api/mrv/projects/{projectId}/data-quality/repair-empty-measurements/jobs/{jobId}:
 *   get:
 *     summary: Get empty-measurement repair job progress
 *     description: Returns progress counters for a background MRV observation repair job.
 *     tags: [MRV Engine - Data Quality]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Repair job progress
 *       404:
 *         description: Repair job not found or expired
 */
router.get('/:projectId/data-quality/repair-empty-measurements/jobs/:jobId', authenticateToken,
  requirePermission('mrv:data-quality:read'),
  verifyMRVProjectAccess(['mrv-data-reviewer', 'mrv-project-manager', 'mrv-programme-admin']),
  async (req, res) => {
    pruneRepairJobs();
    const job = repairJobs.get(req.params.jobId);
    if (!job || job.projectId !== req.params.projectId) {
      return res.status(404).json({ success: false, message: 'Repair job was not found or has expired.' });
    }
    return res.json({ success: true, data: publicRepairJob(job) });
  }
);
/**
 * @swagger
 * /api/mrv/projects/{projectId}/data-quality/repair-empty-measurements:
 *   post:
 *     summary: Repair MRV observations that were created without extracted measurements
 *     description: Rehydrates empty observations from retained MRV observation job envelopes and requeues validation. Intended for operational recovery after parser fixes.
 *     tags: [MRV Engine - Data Quality]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: auid
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100, maximum: 500 }
 *     responses:
 *       200:
 *         description: Repair summary
 */
router.post('/:projectId/data-quality/repair-empty-measurements', authenticateToken,
  requirePermission('mrv:data-quality:write'),
  verifyMRVProjectAccess(['mrv-data-reviewer', 'mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'OBSERVATION_MEASUREMENTS_REPAIRED', entityType: 'MRVObservation', getEntityId: (req) => req.params.projectId }),
  async (req, res) => {
  const observationQueue = openObservationQueue();
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const filter = { projectId: req.params.projectId };
    if (req.query.auid) filter.auid = req.query.auid;
    const candidates = await MRVObservation.find(filter).lean();
    candidates.sort((a, b) => new Date(b.observedAt || b.receivedAt || b.createdAt || 0) - new Date(a.observedAt || a.receivedAt || a.createdAt || 0));
    const emptyRows = candidates.filter((item) => Object.keys(item.measurements || {}).length === 0).slice(0, limit);
    const result = { scanned: candidates.length, candidates: emptyRows.length, repaired: 0, requeued: 0, skipped: 0, errors: [] };

    for (const observation of emptyRows) {
      try {
        const job = await observationQueue.getJob(`obs-${observation.ingestionId}`);
        const envelope = job?.data?.envelope;
        if (!envelope) {
          result.skipped += 1;
          result.errors.push({ observationId: observation.observationId, reason: 'MRV observation job envelope is no longer retained' });
          continue;
        }
        const { measurements, derivedValues, monitoringPeriodId } = extractObservationPayload(envelope);
        if (Object.keys(measurements).length === 0) {
          result.skipped += 1;
          result.errors.push({ observationId: observation.observationId, reason: 'Envelope did not contain numeric measurements' });
          continue;
        }
        await MRVObservation.findOneAndUpdate(
          { observationId: observation.observationId, projectId: req.params.projectId },
          { $set: { measurements, derivedValues, monitoringPeriodId: observation.monitoringPeriodId || monitoringPeriodId || null, qualityStatus: 'PENDING', qualityWarnings: [] } }
        );
        await mrvValidationQueue.add('validation', { observationId: observation.observationId, ingestionId: observation.ingestionId }, {
          jobId: `repair-val-${observation.observationId}-${Date.now()}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 }
        });
        result.repaired += 1;
        result.requeued += 1;
      } catch (itemErr) {
        result.errors.push({ observationId: observation.observationId, reason: itemErr.message });
      }
    }

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    await observationQueue.close();
  }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/data-quality/observations/{observationId}/approve:
 *   post:
 *     summary: Manually approve a quarantined observation
 *     description: |
 *       Overrides the automated QA/QC result and marks the observation as `MANUALLY_APPROVED`.
 *       The observation will be included in completeness and calculation totals.
 *       Requires role: `mrv-data-reviewer`, `mrv-project-manager`, or `mrv-programme-admin`.
 *     tags: [MRV Engine - Data Quality]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: observationId
 *         required: true
 *         schema: { type: string, description: "The observationId (OBS-xxxx)" }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, description: "Reviewer justification for manual approval", example: "Clock drift expected — sensor replaced next day. Data is valid." }
 *     responses:
 *       200:
 *         description: Observation approved — status updated to MANUALLY_APPROVED
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/MRVObservation' }
 *       404: { description: Observation not found }
 *       403: { description: Requires mrv-data-reviewer or above }
 */
router.post('/:projectId/data-quality/observations/:observationId/approve', authenticateToken,
  requirePermission('mrv:data-quality:write'),
  verifyMRVProjectAccess(['mrv-data-reviewer', 'mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'OBSERVATION_APPROVED', entityType: 'MRVObservation', getEntityId: (req) => req.params.observationId }),
  async (req, res) => {
  try {
    const { reason } = req.body;
    const obs = await MRVObservation.findOneAndUpdate(
      { observationId: req.params.observationId, projectId: req.params.projectId },
      { $set: { qualityStatus: 'MANUALLY_APPROVED', manualReviewDecision: { decision: 'APPROVED', reason: reason || '', reviewedBy: req.user?.userid, reviewedAt: new Date() } } },
      { new: true }
    );
    if (!obs) return res.status(404).json({ error: 'Observation not found' });
    res.json({ success: true, data: obs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/data-quality/observations/{observationId}/void:
 *   post:
 *     summary: Void an observation — permanently excluded from calculations
 *     description: |
 *       Marks the observation as `VOIDED`. Voided observations are excluded from all
 *       completeness counts and calculation inputs. A `reason` is mandatory.
 *       Requires role: `mrv-data-reviewer`, `mrv-project-manager`, or `mrv-programme-admin`.
 *     tags: [MRV Engine - Data Quality]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: observationId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string, description: "Mandatory justification for voiding", example: "Sensor malfunction confirmed — readings invalid for entire 2-hour window." }
 *     responses:
 *       200:
 *         description: Observation voided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/MRVObservation' }
 *       400: { description: reason is required }
 *       404: { description: Observation not found }
 */
router.post('/:projectId/data-quality/observations/:observationId/void', authenticateToken,
  requirePermission('mrv:data-quality:write'),
  verifyMRVProjectAccess(['mrv-data-reviewer', 'mrv-project-manager', 'mrv-programme-admin']),
  mrvAuditEvent({ action: 'OBSERVATION_VOIDED', entityType: 'MRVObservation', getEntityId: (req) => req.params.observationId }),
  async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'reason is required for voiding an observation' });
    const obs = await MRVObservation.findOneAndUpdate(
      { observationId: req.params.observationId, projectId: req.params.projectId },
      { $set: { qualityStatus: 'VOIDED', manualReviewDecision: { decision: 'VOIDED', reason, reviewedBy: req.user?.userid, reviewedAt: new Date() } } },
      { new: true }
    );
    if (!obs) return res.status(404).json({ error: 'Observation not found' });
    res.json({ success: true, data: obs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/data-quality/unresolved-receipts:
 *   get:
 *     summary: List unresolved, quarantined, or failed ingest receipts
 *     description: Diagnostic endpoint — shows telemetry receipts that did not complete the full ingestion pipeline.
 *     tags: [MRV Engine - Data Quality]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Unresolved receipts (max 200)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/TelemetryReceipt' }
 */
router.get('/:projectId/data-quality/unresolved-receipts', authenticateToken, requirePermission('mrv:data-quality:read'), verifyMRVProjectAccess(['mrv-data-reviewer', 'mrv-project-manager', 'mrv-programme-admin']), async (req, res) => {
  try {
    const receipts = await TelemetryReceipt.find({ projectIds: req.params.projectId, status: { $in: ['UNRESOLVED', 'QUARANTINED', 'FAILED'] } }).lean();
    receipts.sort((a, b) => new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0));
    const limited = receipts.slice(0, 200);
    res.json({ success: true, data: limited });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
