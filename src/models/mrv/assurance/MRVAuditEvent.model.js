'use strict';
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  projectId: { type: String, index: true },
  organizationId: { type: String, index: true },
  entityType: { type: String, required: true },
  entityId: { type: String },
  action: { type: String, required: true },
  actorId: { type: String, index: true },
  actorRole: { type: String },
  actorIp: { type: String },
  occurredAt: { type: Date, default: Date.now, index: true },
  priorStateHash: { type: String },
  newStateHash: { type: String },
  correlationId: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { versionKey: false });
schema.index({ projectId: 1, occurredAt: -1 });
schema.index({ entityType: 1, entityId: 1, occurredAt: -1 });
module.exports = mongoose.model('MRVAuditEvent', schema, 'mrvAuditEvents');
