'use strict';
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  findingId: { type: String, required: true, unique: true },
  caseId: { type: String, required: true, index: true },
  projectId: { type: String, required: true, index: true },
  severity: {
    type: String,
    enum: ['MINOR', 'MAJOR', 'CORRECTIVE_ACTION_REQUEST', 'FORWARD_ACTION_REQUEST', 'OBSERVATION'],
    required: true
  },
  category: { type: String },
  description: { type: String, required: true },
  affectedEntities: [{ type: String }],
  raisedBy: { type: String },
  raisedAt: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ['OPEN', 'RESPONSE_SUBMITTED', 'RESOLVED', 'NOT_ACCEPTED', 'CLOSED'],
    default: 'OPEN'
  },
  projectResponse: { type: String },
  projectRespondedAt: { type: Date },
  vvbDecision: { type: String, enum: ['ACCEPTED', 'REJECTED', 'PENDING'] },
  vvbDecisionAt: { type: Date },
  closedAt: { type: Date },
  evidenceIds: [{ type: String }],
  notes: { type: String }
}, { versionKey: false });
schema.index({ caseId: 1, status: 1 });
module.exports = mongoose.model('VerificationFinding', schema, 'verificationFindings');
