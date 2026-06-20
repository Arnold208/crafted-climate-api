'use strict';
const router = require('express').Router({ mergeParams: true });
const calcService = require('../../services/mrv/mrvCalculationService');

const ok  = (res, data) => res.json({ success: true, ...data });
const err = (res, e, code = 500) => res.status(code).json({ success: false, error: e.message });

/**
 * @swagger
 * /api/mrv/projects/{projectId}/monitoring-periods/{mpId}/calculate:
 *   post:
 *     summary: Run VM0050 ERy calculation for a closed monitoring period
 *     tags: [MRV Calculation]
 *     description: |
 *       Applies VM0050 Equation 1 (ERy = BEy − PEy − LKy) using Tier 1 IPCC constants.
 *       Period must be in CLOSED status. Creates a versioned, immutable CalculationRun.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: mpId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Calculation complete
 *       400:
 *         description: Period not CLOSED or no observations found
 *       409:
 *         description: Approved run already exists
 */
router.post('/:projectId/monitoring-periods/:mpId/calculate', async (req, res) => {
  try {
    const run = await calcService.runCalculation(
      req.params.mpId,
      req.user?.userid || 'api'
    );
    ok(res, {
      message:          'VM0050 calculation complete',
      calculationRunId: run.calculationRunId,
      runVersion:       run.runVersion,
      status:           run.status,
      results:          run.results,
      methodology:      'VM0050',
      constants:        run.intermediateValues?.constants,
    });
  } catch (e) {
    const code = e.message.includes('not found') ? 404
      : e.message.includes('must be CLOSED') ? 400
      : e.message.includes('already exists') ? 409
      : e.message.includes('No accepted observations') ? 422
      : 500;
    err(res, e, code);
  }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/monitoring-periods/{mpId}/calculation:
 *   get:
 *     summary: Get the latest VM0050 calculation result for a monitoring period
 *     tags: [MRV Calculation]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: mpId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Latest calculation run
 *       404:
 *         description: No calculation run found
 */
router.get('/:projectId/monitoring-periods/:mpId/calculation', async (req, res) => {
  try {
    const run = await calcService.getLatestRun(req.params.mpId);
    if (!run) return res.status(404).json({ success: false, error: 'No calculation run found for this period' });
    ok(res, { calculationRun: run });
  } catch (e) { err(res, e); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/monitoring-periods/{mpId}/calculations:
 *   get:
 *     summary: Get full calculation run history for a monitoring period
 *     tags: [MRV Calculation]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: mpId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: All calculation runs in descending version order
 */
router.get('/:projectId/monitoring-periods/:mpId/calculations', async (req, res) => {
  try {
    const runs = await calcService.getAllRuns(req.params.mpId);
    ok(res, { calculationRuns: runs, count: runs.length });
  } catch (e) { err(res, e); }
});

/**
 * @swagger
 * /api/mrv/projects/{projectId}/calculation-runs/{runId}/approve:
 *   post:
 *     summary: Approve a calculation run for registry submission
 *     tags: [MRV Calculation]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 description: Optional reviewer notes
 *     responses:
 *       200:
 *         description: Run approved for submission
 *       400:
 *         description: Run is not in an approvable state
 *       404:
 *         description: Calculation run not found
 */
router.post('/:projectId/calculation-runs/:runId/approve', async (req, res) => {
  try {
    const run = await calcService.approveRun(
      req.params.runId,
      req.user?.userid || 'api',
      req.body?.notes || ''
    );
    ok(res, { message: 'Calculation run approved for submission', calculationRun: run });
  } catch (e) {
    const code = e.message.includes('not found') ? 404 : e.message.includes('can only be') ? 400 : 500;
    err(res, e, code);
  }
});

module.exports = router;
