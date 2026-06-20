'use strict';
const { Worker } = require('bullmq');
const { v4: uuidv4 } = require('uuid');
const { canonicalSerialize } = require('../../services/mrv/mrvHashService');
const { writeRawEvent } = require('../../services/mrv/mrvBlobService');
const { buildIdempotencyKey, checkDuplicate, createPendingReceipt, updateReceiptStatus } = require('../../services/mrv/mrvIdempotencyService');
const { mrvObservationQueue } = require('./queues');
const logger = require('../../utils/logger');

function startMRVEvidenceWorker() {
  const connection = { host: process.env.REDIS_HOST || '127.0.0.1', port: parseInt(process.env.REDIS_PORT || '6379', 10), password: process.env.REDIS_PASSWORD || undefined, keepAlive: 30000, maxRetriesPerRequest: null };

  const worker = new Worker('mrv-evidence', async (job) => {
    const envelope = job.data;
    const { ingestionId, devid, auid, model, transport, sourceTopic, sourceEventId,
            organizationId, projectIds, receivedAt, observedAt, timeSource, clockQuality,
            sequenceNumber, firmwareVersion, rawEvent } = envelope;

    const { canonical: canonicalJson, hash: payloadHash } = canonicalSerialize(rawEvent || envelope);
    const idempotencyKey = buildIdempotencyKey({ sourceEventId, devid, sequenceNumber, observedAt, payloadHash });

    const existing = await checkDuplicate(idempotencyKey);
    if (existing) {
      logger.debug(`[MRVEvidence] Duplicate skipped: ${idempotencyKey}`);
      await updateReceiptStatus(existing.ingestionId, 'DUPLICATE', { processingAttempts: (existing.processingAttempts || 0) + 1 });
      return { duplicate: true, receiptId: existing.receiptId };
    }

    const receiptId = `RCPT-${uuidv4()}`;
    await createPendingReceipt({
      receiptId, ingestionId, idempotencyKey, sourceEventId,
      transport, sourceTopic, devid, auid, model,
      organizationId, projectIds,
      receivedAt: new Date(receivedAt), observedAt: observedAt ? new Date(observedAt) : null,
      timeSource, clockQuality, sequenceNumber, firmwareVersion, retentionClass: 'MRV'
    });

    const { canonical, hash } = canonicalSerialize(envelope);
    const blobResult = await writeRawEvent({ ingestionId, canonicalJson: canonical, hash });
    if (blobResult) {
      await updateReceiptStatus(ingestionId, 'STORED', { rawBlobPath: blobResult.blobPath, rawBlobContainer: blobResult.blobContainer, rawBlobHash: blobResult.hash });
    } else {
      logger.warn(`[MRVEvidence] Blob write skipped for ${ingestionId} (no Azure connection)`);
    }

    await mrvObservationQueue.add('observation', { ingestionId, receiptId, envelope }, {
      jobId: `obs-${ingestionId}`, attempts: 3, backoff: { type: 'exponential', delay: 2000 }
    });

    logger.info(`[MRVEvidence] Receipt created: ${receiptId} | ingestion: ${ingestionId}`);
    return { receiptId };
  }, { connection, concurrency: 20, removeOnComplete: { age: 3600, count: 500 }, removeOnFail: { age: 86400 } });

  worker.on('failed', (job, err) => {
    logger.error(`[MRVEvidence] Job ${job?.id} failed: ${err.message}`);
    if (job?.attemptsMade >= (job?.opts?.attempts || 3)) {
      logger.error(`[MRVEvidence] FINAL FAILURE — evidence may be lost for ingestionId: ${job?.data?.ingestionId}`);
    }
  });
  worker.on('error', err => logger.error('[MRVEvidence] Worker error:', err));
  console.log('✅ MRV Evidence Worker started');
  return worker;
}

module.exports = { startMRVEvidenceWorker };
