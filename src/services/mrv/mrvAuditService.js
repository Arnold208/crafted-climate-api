'use strict';
const { v4: uuidv4 } = require('uuid');
const MRVAuditEvent = require('../../models/mrv/assurance/MRVAuditEvent.model');
const { canonicalSerialize } = require('./mrvHashService');

async function logMRVEvent({
  projectId, organizationId, entityType, entityId, action,
  actorId, actorRole, actorIp, priorState, newState, correlationId, metadata = {}
}) {
  try {
    const priorStateHash = priorState ? canonicalSerialize(priorState).hash : undefined;
    const newStateHash = newState ? canonicalSerialize(newState).hash : undefined;
    await MRVAuditEvent.create({
      eventId: `MRVAEV-${uuidv4()}`,
      projectId, organizationId, entityType, entityId, action,
      actorId, actorRole, actorIp,
      occurredAt: new Date(),
      priorStateHash, newStateHash, correlationId, metadata
    });
  } catch (err) {
    console.error('[MRVAudit] Failed to write audit event:', err.message);
  }
}

module.exports = { logMRVEvent };
