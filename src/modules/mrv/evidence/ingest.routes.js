'use strict';
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { buildCanonicalEnvelope } = require('../../telemetry/evidence/envelope');
const { mrvEvidenceQueue } = require('../../../workers/mrv/queues');
const logger = require('../../../utils/logger');

/**
 * @swagger
 * /api/ingest/telemetry:
 *   post:
 *     summary: HTTP ingest — submit a single telemetry event for MRV processing
 *     description: |
 *       Accepts a telemetry payload and enqueues it to the `mrv-evidence` BullMQ queue
 *       for the full 5-stage MRV pipeline (Evidence → Observation → Validation → Qualification → Completeness).
 *
 *       Use this endpoint for:
 *       - Blues Notecard HTTP fallback (when MQTT is unavailable)
 *       - Local sensor gateway posting data over HTTP
 *       - **Testing and sandbox ingestion** — submit test data here to verify the pipeline
 *
 *       **Idempotency:** If `event` (UUID) is provided, duplicate submissions with the same UUID
 *       will be detected and skipped automatically.
 *
 *       **No authentication required** — secured by network/API-key layer at the gateway level.
 *     tags: [MRV Engine - Evidence and Ingest]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TelemetryIngestRequest' }
 *           examples:
 *             gas_solo:
 *               summary: Gas Solo CO₂ sensor reading
 *               value:
 *                 devid: "dev:000000000000001"
 *                 devmod: GAS-SOLO
 *                 auid: "dev-00001"
 *                 ts: 1750204800
 *                 event: "550e8400-e29b-41d4-a716-446655440000"
 *                 seq: 42
 *                 version: "1.1.0"
 *                 organizationId: "org-abc123"
 *                 projectIds: ["CC-CLEA-LZKJ3MN"]
 *                 body:
 *                   equivalent_co2: 850
 *                   tvoc: 120
 *                   temperature: 28.5
 *                   humidity: 65.2
 *                   aqi: 2
 *                   battery: 87
 *             manual_meter:
 *               summary: Commercial electricity meter (manual-meter model)
 *               value:
 *                 devid: "METER-001"
 *                 devmod: MANUAL-METER
 *                 auid: "meter-00001"
 *                 ts: 1750204800
 *                 event: "660f9511-f30c-52e5-b827-557766551111"
 *                 organizationId: "org-abc123"
 *                 projectIds: ["CC-CLEA-LZKJ3MN"]
 *                 body:
 *                   electricity_kwh: 1250.4
 *             env_sensor:
 *               summary: ENV sensor (PM2.5, temperature, humidity)
 *               value:
 *                 devid: "dev:000000000000002"
 *                 devmod: ENV
 *                 auid: "dev-00002"
 *                 ts: 1750204800
 *                 event: "770a0622-041d-63f6-c938-668877662222"
 *                 organizationId: "org-abc123"
 *                 body:
 *                   pm2_5: 12.4
 *                   pm10: 22.1
 *                   temperature: 27.8
 *                   humidity: 68.0
 *     responses:
 *       202:
 *         description: Accepted — envelope enqueued for MRV processing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 ingestionId: { type: string, format: uuid, description: "Unique ID to track this event through the pipeline" }
 *                 jobId: { type: string, description: "BullMQ job ID (use ingestionId to look up in /receipts)" }
 *                 message: { type: string, example: Telemetry accepted and enqueued for MRV processing }
 *       400:
 *         description: devid is required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error: { type: string, example: devid is required }
 *       500:
 *         description: Server error
 */
router.post('/telemetry', async (req, res) => {
  try {
    const body = req.body;
    if (!body || !body.devid) return res.status(400).json({ error: 'devid is required' });
    const ingestionId = uuidv4();
    const sourceEventId = body.event || null;
    const ts = body.ts || body.time || null;
    const observedAt = ts ? (ts < 1e12 ? new Date(ts * 1000).toISOString() : new Date(ts).toISOString()) : null;
    const envelope = buildCanonicalEnvelope({ rawEvent: body, devid: body.devid, auid: body.auid || null, model: (body.devmod || '').toUpperCase(), transport: 'http-ingest', sourceTopic: null, sourceEventId, observedAt, sequenceNumber: body.seq || null, firmwareVersion: body.version || null, organizationId: body.organizationId || null, projectIds: body.projectIds || [] });
    envelope.ingestionId = ingestionId;
    const jobId = sourceEventId ? `mrv-${sourceEventId}` : `mrv-${ingestionId}`;
    await mrvEvidenceQueue.add('evidence', envelope, { jobId, attempts: 3, backoff: { type: 'exponential', delay: 2000 } });
    logger.info(`[HTTPIngest] Accepted: ingestionId=${ingestionId} devid=${body.devid}`);
    res.status(202).json({ success: true, ingestionId, jobId, message: 'Telemetry accepted and enqueued for MRV processing' });
  } catch (err) {
    logger.error(`[HTTPIngest] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/ingest/telemetry/batch:
 *   post:
 *     summary: HTTP ingest — submit up to 100 telemetry events in one request
 *     description: |
 *       Batch version of the single ingest endpoint. Each event is enqueued independently.
 *       Events missing `devid` are skipped with an error entry in the results array.
 *
 *       **Maximum:** 100 events per request.
 *     tags: [MRV Engine - Evidence and Ingest]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [events]
 *             properties:
 *               events:
 *                 type: array
 *                 maxItems: 100
 *                 description: Array of telemetry payloads (same format as single /telemetry)
 *                 items: { $ref: '#/components/schemas/TelemetryIngestRequest' }
 *           examples:
 *             batch_example:
 *               summary: Batch of 2 events
 *               value:
 *                 events:
 *                   - devid: "dev:000000000000001"
 *                     devmod: GAS-SOLO
 *                     auid: "dev-00001"
 *                     ts: 1750204800
 *                     event: "550e8400-e29b-41d4-a716-446655440000"
 *                     organizationId: "org-abc123"
 *                     projectIds: ["CC-CLEA-LZKJ3MN"]
 *                     body: { equivalent_co2: 850, tvoc: 120, battery: 87 }
 *                   - devid: "dev:000000000000002"
 *                     devmod: ENV
 *                     auid: "dev-00002"
 *                     ts: 1750204800
 *                     event: "660f9511-f30c-52e5-b827-557766551111"
 *                     organizationId: "org-abc123"
 *                     body: { pm2_5: 12.4, temperature: 27.8, humidity: 68.0 }
 *     responses:
 *       202:
 *         description: Batch processed — check results array for per-event status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 accepted: { type: integer, example: 2 }
 *                 skipped: { type: integer, example: 0 }
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       devid: { type: string }
 *                       ingestionId: { type: string }
 *                       jobId: { type: string }
 *                       error: { type: string, description: "Present only if this event was skipped" }
 *       400:
 *         description: events array required or exceeds 100 limit
 */
router.post('/telemetry/batch', async (req, res) => {
  try {
    const { events } = req.body;
    if (!Array.isArray(events) || events.length === 0) return res.status(400).json({ error: 'events array is required' });
    if (events.length > 100) return res.status(400).json({ error: 'Maximum 100 events per batch' });
    const results = [];
    for (const body of events) {
      if (!body.devid) { results.push({ devid: null, error: 'devid missing — skipped' }); continue; }
      const ingestionId = uuidv4();
      const sourceEventId = body.event || null;
      const ts = body.ts || body.time || null;
      const observedAt = ts ? (ts < 1e12 ? new Date(ts * 1000).toISOString() : new Date(ts).toISOString()) : null;
      const envelope = buildCanonicalEnvelope({ rawEvent: body, devid: body.devid, auid: body.auid || null, model: (body.devmod || '').toUpperCase(), transport: 'http-ingest', sourceTopic: null, sourceEventId, observedAt, sequenceNumber: body.seq || null, firmwareVersion: body.version || null, organizationId: body.organizationId || null, projectIds: body.projectIds || [] });
      envelope.ingestionId = ingestionId;
      const jobId = sourceEventId ? `mrv-${sourceEventId}` : `mrv-${ingestionId}`;
      await mrvEvidenceQueue.add('evidence', envelope, { jobId, attempts: 3, backoff: { type: 'exponential', delay: 2000 } });
      results.push({ devid: body.devid, ingestionId, jobId });
    }
    res.status(202).json({ success: true, accepted: results.filter(r => !r.error).length, skipped: results.filter(r => r.error).length, results });
  } catch (err) {
    logger.error(`[HTTPIngest/batch] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
