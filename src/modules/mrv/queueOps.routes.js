'use strict';

const router = require('express').Router();
const { getQueuesHealth, getQueueSummary, retryFailedJobs, ALLOWED_QUEUES } = require('../../services/queueOperations.service');

function canManageQueues(req) {
  const role = req.user?.role || req.user?.userRole || req.user?.mrvRole;
  const roles = [role, ...(req.user?.roles || []), ...(req.user?.mrvRoles || [])].filter(Boolean);
  return roles.some((item) => ['admin', 'super-admin', 'platform-admin', 'mrv-programme-admin'].includes(String(item).toLowerCase()));
}

function requireQueueManager(req, res, next) {
  if (canManageQueues(req)) return next();
  return res.status(403).json({
    success: false,
    error: 'Only MRV programme administrators can inspect and retry background queues.'
  });
}

/**
 * @swagger
 * /api/mrv/ops/queues:
 *   get:
 *     summary: Inspect MRV and telemetry queue health
 *     tags: [MRV Engine]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Worker registry and queue counts for telemetry and MRV queues
 *       403:
 *         description: User is not allowed to manage MRV operations queues
 */
router.get('/queues', requireQueueManager, async (_req, res) => {
  try {
    const health = await getQueuesHealth();
    res.json({ success: true, data: health });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @swagger
 * /api/mrv/ops/queues/{queueName}:
 *   get:
 *     summary: Inspect one MRV or telemetry queue
 *     tags: [MRV Engine]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: queueName
 *         required: true
 *         schema:
 *           type: string
 *           enum: [telemetry, status, mrv-evidence, mrv-observation, mrv-validation, mrv-qualification, mrv-completeness, mrv-readiness, mrv-calculation, mrv-report, mrv-notifications, mrv-webhook]
 *       - in: query
 *         name: failedLimit
 *         schema:
 *           type: integer
 *           default: 5
 *     responses:
 *       200:
 *         description: Queue counts and sample failed jobs
 */
router.get('/queues-meta', requireQueueManager, (_req, res) => {
  res.json({ success: true, data: { queues: Array.from(ALLOWED_QUEUES).sort() } });
});
router.get('/queues/:queueName', requireQueueManager, async (req, res) => {
  try {
    const failedLimit = Math.min(Math.max(parseInt(req.query.failedLimit, 10) || 5, 0), 50);
    const summary = await getQueueSummary(req.params.queueName, failedLimit);
    res.json({ success: true, data: summary });
  } catch (err) {
    const status = /Unsupported queue/.test(err.message) ? 400 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

/**
 * @swagger
 * /api/mrv/ops/queues/{queueName}/retry-failed:
 *   post:
 *     summary: Retry failed jobs from a telemetry or MRV queue
 *     tags: [MRV Engine]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: queueName
 *         required: true
 *         schema:
 *           type: string
 *           enum: [telemetry, status, mrv-evidence, mrv-observation, mrv-validation, mrv-qualification, mrv-completeness, mrv-readiness, mrv-calculation, mrv-report, mrv-notifications, mrv-webhook]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               limit:
 *                 type: integer
 *                 default: 100
 *                 maximum: 500
 *     responses:
 *       200:
 *         description: Retry result with retried, skipped, and errors counts
 */
router.post('/queues/:queueName/retry-failed', requireQueueManager, async (req, res) => {
  try {
    const result = await retryFailedJobs(req.params.queueName, req.body?.limit || 100);
    res.json({ success: true, data: result });
  } catch (err) {
    const status = /Unsupported queue/.test(err.message) ? 400 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

module.exports = router;