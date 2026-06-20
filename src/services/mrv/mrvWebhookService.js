'use strict';
/**
 * MRV Outbound Webhook Service
 * ════════════════════════════
 * Dispatches signed webhook payloads to partner URLs.
 *
 * Signing: HMAC-SHA256 — header: X-MRV-Signature: sha256=<hex>
 * Retry: 3 attempts with exponential backoff via BullMQ
 */

const crypto                = require('crypto');
const { v4: uuidv4 }        = require('uuid');
const https                 = require('https');
const http                  = require('http');
const MRVWebhookEndpoint    = require('../../models/mrv/outbound/MRVWebhookEndpoint.model');
const MRVWebhookDelivery    = require('../../models/mrv/outbound/MRVWebhookDelivery.model');
const logger                = require('../../utils/logger');

// ── HMAC Signing ──────────────────────────────────────────────────────────

function signPayload(secret, body) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// ── HTTP Delivery ─────────────────────────────────────────────────────────

function deliver(url, body, signature) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps   = parsedUrl.protocol === 'https:';
    const lib       = isHttps ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port:     parsedUrl.port || (isHttps ? 443 : 80),
      path:     parsedUrl.pathname + parsedUrl.search,
      method:   'POST',
      headers: {
        'Content-Type':    'application/json',
        'Content-Length':  Buffer.byteLength(body),
        'X-MRV-Signature': signature,
        'X-MRV-Event':     'mrv-webhook',
        'User-Agent':      'CraftedClimate-MRV/1.0',
      },
      timeout: 10000, // 10s timeout
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data.slice(0, 500) }));
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out after 10s')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Enqueue Webhook Event ─────────────────────────────────────────────────

/**
 * Find all ACTIVE endpoints subscribed to this event and enqueue deliveries.
 * Non-blocking — never throws. Failures are logged only.
 *
 * @param {string} projectId
 * @param {string} event        — e.g. 'observation.created'
 * @param {object} payload      — event data
 */
async function dispatchWebhookEvent(projectId, event, payload) {
  try {
    const { mrvWebhookQueue } = require('../../workers/mrv/queues');

    const endpoints = await MRVWebhookEndpoint.find({
      projectId,
      status: 'ACTIVE',
      events: event,
    }).lean();

    if (!endpoints.length) return;

    for (const endpoint of endpoints) {
      const deliveryId = `WHDEL-${uuidv4()}`;
      await MRVWebhookDelivery.create({
        deliveryId,
        endpointId: endpoint.endpointId,
        projectId,
        event,
        payload,
        status:     'PENDING',
        enqueuedAt: new Date(),
        createdAt:  new Date(),
      });

      await mrvWebhookQueue.add('deliver', {
        deliveryId,
        endpointId:  endpoint.endpointId,
        url:         endpoint.url,
        secret:      endpoint.secret,
        event,
        payload,
      }, {
        jobId:   deliveryId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });
    }

    logger.info(`[MRVWebhook] Enqueued ${endpoints.length} delivery(ies) for event=${event} project=${projectId}`);
  } catch (err) {
    // Webhook failures must NEVER affect the operational path
    logger.error(`[MRVWebhook] dispatchWebhookEvent failed: ${err.message}`);
  }
}

// ── Process Delivery (called by worker) ──────────────────────────────────

/**
 * Execute a webhook delivery attempt.
 * Updates the MRVWebhookDelivery record with the outcome.
 *
 * @param {object} jobData  — { deliveryId, url, secret, event, payload }
 */
async function processDelivery(jobData) {
  const { deliveryId, url, secret, event, payload } = jobData;

  const delivery = await MRVWebhookDelivery.findOne({ deliveryId });
  if (!delivery) throw new Error(`Delivery record not found: ${deliveryId}`);

  delivery.attempts      += 1;
  delivery.lastAttemptAt  = new Date();

  try {
    const body      = JSON.stringify({ event, deliveryId, timestamp: new Date().toISOString(), data: payload });
    const signature = signPayload(secret, body);
    const result    = await deliver(url, body, signature);

    const success = result.statusCode >= 200 && result.statusCode < 300;
    delivery.status       = success ? 'DELIVERED' : 'FAILED';
    delivery.responseCode = result.statusCode;
    delivery.responseBody = result.body;
    if (success) delivery.deliveredAt = new Date();

    await delivery.save();

    if (!success) {
      throw new Error(`Endpoint returned HTTP ${result.statusCode}: ${result.body.slice(0, 200)}`);
    }

    logger.info(`[MRVWebhook] Delivered: ${deliveryId} → ${url} (${result.statusCode})`);
    return { deliveryId, statusCode: result.statusCode };

  } catch (err) {
    delivery.status       = 'FAILED';
    delivery.errorMessage = err.message;
    await delivery.save();
    throw err; // re-throw so BullMQ handles retry
  }
}

module.exports = { dispatchWebhookEvent, processDelivery, signPayload };
