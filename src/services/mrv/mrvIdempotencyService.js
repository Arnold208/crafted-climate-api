'use strict';
const TelemetryReceipt = require('../../models/mrv/evidence/TelemetryReceipt.model');

function buildIdempotencyKey({ sourceEventId, devid, sequenceNumber, observedAt, payloadHash }) {
  if (sourceEventId) return `evt:${sourceEventId}`;
  if (devid && sequenceNumber) return `seq:${devid}:${sequenceNumber}`;
  if (devid && observedAt && payloadHash) return `ts:${devid}:${observedAt}:${payloadHash.slice(0, 16)}`;
  return `fallback:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

async function checkDuplicate(idempotencyKey) {
  return TelemetryReceipt.findOne({ idempotencyKey }).lean();
}

async function createPendingReceipt({
  receiptId, ingestionId, idempotencyKey, sourceEventId,
  transport, sourceTopic, devid, auid, model,
  organizationId, projectIds, receivedAt, observedAt,
  timeSource, clockQuality, sequenceNumber, firmwareVersion, retentionClass
}) {
  return TelemetryReceipt.create({
    receiptId, ingestionId, idempotencyKey, sourceEventId,
    transport, sourceTopic, devid, auid, model,
    organizationId, projectIds: projectIds || [],
    receivedAt, observedAt: observedAt || null,
    timeSource: timeSource || 'server-received',
    clockQuality: clockQuality || 'unverified',
    sequenceNumber, firmwareVersion,
    retentionClass: retentionClass || 'MRV',
    status: 'PENDING'
  });
}

async function updateReceiptStatus(ingestionId, status, updates = {}) {
  return TelemetryReceipt.findOneAndUpdate(
    { ingestionId },
    { $set: { status, updatedAt: new Date(), ...updates } },
    { new: true }
  );
}

module.exports = { buildIdempotencyKey, checkDuplicate, createPendingReceipt, updateReceiptStatus };
