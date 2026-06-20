'use strict';
/**
 * MRV Outbound Webhook Routes
 * ════════════════════════════
 * Manage webhook endpoints for a project and view delivery logs.
 *
 * Routes:
 *   POST   /api/mrv/projects/:projectId/webhooks              — register endpoint
 *   GET    /api/mrv/projects/:projectId/webhooks              — list endpoints
 *   PATCH  /api/mrv/projects/:projectId/webhooks/:endpointId  — update (pause/resume/change URL)
 *   DELETE /api/mrv/projects/:projectId/webhooks/:endpointId  — disable endpoint
 *   GET    /api/mrv/projects/:projectId/webhooks/:endpointId/deliveries — delivery log
 *   POST   /api/mrv/projects/:projectId/webhooks/:endpointId/test      — fire a test ping
 */

const router               = require('express').Router();
const crypto               = require('crypto');
const { v4: uuidv4 }       = require('uuid');
const authenticateToken    = require('../../middleware/bearermiddleware');
const { verifyMRVProjectAccess } = require('../../middleware/mrv/verifyMRVProjectAccess');
const MRVWebhookEndpoint   = require('../../models/mrv/outbound/MRVWebhookEndpoint.model');
const MRVWebhookDelivery   = require('../../models/mrv/outbound/MRVWebhookDelivery.model');
const { dispatchWebhookEvent } = require('../../services/mrv/mrvWebhookService');

const MANAGER_ROLES = ['mrv-project-manager', 'mrv-programme-admin'];

// ── Register Endpoint ─────────────────────────────────────────────────────

/**
 * @swagger
 * /api/mrv/projects/{projectId}/webhooks:
 *   post:
 *     summary: Register an outbound webhook endpoint for this project
 *     description: |
 *       When MRV events occur (observation created, period opened/closed, etc.),
 *       CraftedClimate will POST a signed JSON payload to the registered URL.
 *
 *       **Signature verification:**
 *       Each request includes header `X-MRV-Signature: sha256=<hex>`.
 *       Verify it by computing `HMAC-SHA256(secret, requestBody)`.
 *
 *       **Available events:**
 *       - `observation.created` — new MRV observation processed
 *       - `observation.quarantined` — observation flagged by QA
 *       - `observation.approved` — quarantined observation manually approved
 *       - `period.opened` — monitoring period opened
 *       - `period.closed` — monitoring period closed
 *       - `period.completeness` — completeness check result
 *       - `verification.opinion` — VVB opinion submitted
 *       - `installation.linked` — device linked to project
 *       - `installation.maintenance` — device put in maintenance
 *       - `installation.replaced` — device replaced
 *     tags: [MRV Engine - Webhooks]
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
 *             required: [url, events]
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 description: HTTPS URL to deliver events to
 *                 example: https://partner.example.com/mrv-events
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [observation.created, observation.quarantined, observation.approved, period.opened, period.closed, period.completeness, verification.opinion, installation.linked, installation.maintenance, installation.replaced]
 *                 description: List of events to subscribe to
 *               description:
 *                 type: string
 *                 description: Optional label for this endpoint
 *     responses:
 *       201:
 *         description: Endpoint registered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 endpointId: { type: string }
 *                 secret: { type: string, description: "HMAC signing secret — store this securely, shown only once" }
 *                 data: { type: object }
 */
router.post('/:projectId/webhooks', authenticateToken, verifyMRVProjectAccess(MANAGER_ROLES), async (req, res) => {
  try {
    const { url, events, description } = req.body;
    if (!url)    return res.status(400).json({ error: 'url is required' });
    if (!events || !Array.isArray(events) || events.length === 0)
      return res.status(400).json({ error: 'events array is required (at least one event)' });

    // Validate URL
    try { new URL(url); } catch { return res.status(400).json({ error: 'url must be a valid URL' }); }

    const endpointId = `WHEP-${uuidv4()}`;
    const secret     = crypto.randomBytes(32).toString('hex'); // 64-char hex secret

    const endpoint = await MRVWebhookEndpoint.create({
      endpointId,
      projectId:      req.params.projectId,
      organizationId: req.mrvProject.organizationId,
      url,
      secret,
      events,
      description:    description || null,
      status:         'ACTIVE',
      createdBy:      req.user.userid,
      createdAt:      new Date(),
      updatedAt:      new Date(),
    });

    res.status(201).json({
      success:    true,
      endpointId,
      secret,     // shown ONCE — partner must store this
      message:    'Webhook endpoint registered. Store the secret securely — it will not be shown again.',
      data: {
        endpointId: endpoint.endpointId,
        url:        endpoint.url,
        events:     endpoint.events,
        status:     endpoint.status,
        description: endpoint.description,
        createdAt:  endpoint.createdAt,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── List Endpoints ────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/mrv/projects/{projectId}/webhooks:
 *   get:
 *     summary: List all registered webhook endpoints for this project
 *     tags: [MRV Engine - Webhooks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of registered endpoints (secrets are NOT returned)
 */
router.get('/:projectId/webhooks', authenticateToken, verifyMRVProjectAccess(), async (req, res) => {
  try {
    const endpoints = await MRVWebhookEndpoint.find(
      { projectId: req.params.projectId },
      { secret: 0 }  // never return secret
    ).sort({ _id: -1 }).lean();
    res.json({ success: true, count: endpoints.length, data: endpoints });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Update Endpoint ───────────────────────────────────────────────────────

/**
 * @swagger
 * /api/mrv/projects/{projectId}/webhooks/{endpointId}:
 *   patch:
 *     summary: Update a webhook endpoint (pause, resume, change URL or events)
 *     tags: [MRV Engine - Webhooks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: endpointId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:         { type: string }
 *               events:      { type: array, items: { type: string } }
 *               status:      { type: string, enum: [ACTIVE, PAUSED, DISABLED] }
 *               description: { type: string }
 *     responses:
 *       200:
 *         description: Endpoint updated
 */
router.patch('/:projectId/webhooks/:endpointId', authenticateToken, verifyMRVProjectAccess(MANAGER_ROLES), async (req, res) => {
  try {
    const endpoint = await MRVWebhookEndpoint.findOne({
      endpointId:  req.params.endpointId,
      projectId:   req.params.projectId,
    });
    if (!endpoint) return res.status(404).json({ error: 'Webhook endpoint not found' });

    const { url, events, status, description } = req.body;
    if (url)         { try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); } endpoint.url = url; }
    if (events)      endpoint.events      = events;
    if (status)      endpoint.status      = status;
    if (description !== undefined) endpoint.description = description;
    endpoint.updatedAt = new Date();
    await endpoint.save();

    const safe = endpoint.toObject();
    delete safe.secret;
    res.json({ success: true, data: safe });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Disable Endpoint ──────────────────────────────────────────────────────

/**
 * @swagger
 * /api/mrv/projects/{projectId}/webhooks/{endpointId}:
 *   delete:
 *     summary: Disable a webhook endpoint (soft delete — sets status to DISABLED)
 *     tags: [MRV Engine - Webhooks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: endpointId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Endpoint disabled
 */
router.delete('/:projectId/webhooks/:endpointId', authenticateToken, verifyMRVProjectAccess(MANAGER_ROLES), async (req, res) => {
  try {
    const endpoint = await MRVWebhookEndpoint.findOneAndUpdate(
      { endpointId: req.params.endpointId, projectId: req.params.projectId },
      { $set: { status: 'DISABLED', updatedAt: new Date() } },
      { new: true, projection: { secret: 0 } }
    );
    if (!endpoint) return res.status(404).json({ error: 'Webhook endpoint not found' });
    res.json({ success: true, message: 'Endpoint disabled', data: endpoint });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Delivery Log ──────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/mrv/projects/{projectId}/webhooks/{endpointId}/deliveries:
 *   get:
 *     summary: View delivery history for a webhook endpoint
 *     description: Shows delivery attempts, HTTP response codes, and error details.
 *     tags: [MRV Engine - Webhooks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: endpointId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, DELIVERED, FAILED, ABANDONED] }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Delivery log
 */
router.get('/:projectId/webhooks/:endpointId/deliveries', authenticateToken, verifyMRVProjectAccess(), async (req, res) => {
  try {
    const filter = { endpointId: req.params.endpointId, projectId: req.params.projectId };
    if (req.query.status) filter.status = req.query.status;
    const limit = Math.min(parseInt(req.query.limit || '50'), 200);
    const deliveries = await MRVWebhookDelivery.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ success: true, count: deliveries.length, data: deliveries });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Test Ping ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/mrv/projects/{projectId}/webhooks/{endpointId}/test:
 *   post:
 *     summary: Send a test ping to a webhook endpoint
 *     description: Fires a synthetic `ping` event to verify the endpoint URL is reachable.
 *     tags: [MRV Engine - Webhooks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: endpointId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       202:
 *         description: Test ping enqueued
 */
router.post('/:projectId/webhooks/:endpointId/test', authenticateToken, verifyMRVProjectAccess(MANAGER_ROLES), async (req, res) => {
  try {
    const endpoint = await MRVWebhookEndpoint.findOne(
      { endpointId: req.params.endpointId, projectId: req.params.projectId },
      { secret: 1, url: 1, status: 1 }
    ).lean();
    if (!endpoint) return res.status(404).json({ error: 'Webhook endpoint not found' });
    if (endpoint.status === 'DISABLED') return res.status(409).json({ error: 'Cannot test a DISABLED endpoint. Re-enable it first.' });

    // Dispatch a synthetic ping event
    await dispatchWebhookEvent(req.params.projectId, 'observation.created', {
      _test: true,
      message: 'This is a test ping from CraftedClimate MRV Engine',
      projectId: req.params.projectId,
      endpointId: req.params.endpointId,
      sentAt: new Date().toISOString(),
    });

    res.status(202).json({
      success: true,
      message: 'Test ping enqueued. Check the delivery log in a few seconds.',
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
