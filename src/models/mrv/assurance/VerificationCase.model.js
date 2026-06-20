'use strict';
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  caseId: { type: String, required: true, unique: true },
  projectId: { type: String, required: true, index: true },
  reportId: { type: String },
  calculationRunId: { type: String },
  organizationId: { type: String, required: true },
  vvbOrganizationName: { type: String },
  vvbContactName: { type: String },
  vvbContactEmail: { type: String },
  vvbUserId: { type: String },
  scope: { type: String, enum: ['VALIDATION', 'VERIFICATION', 'COMBINED'], required: true },
  status: {
    type: String,
    enum: ['OPEN', 'FINDINGS_RAISED', 'RESPONSES_SUBMITTED', 'OPINION_RECORDED', 'CLOSED'],
    default: 'OPEN'
  },
  findings: [{ type: String }],
  verificationOpinion: {
    opinion: { type: String, enum: ['POSITIVE', 'POSITIVE_WITH_QUALIFICATIONS', 'ADVERSE', 'DISCLAIMER'] },
    notes: { type: String },
    reportEvidenceId: { type: String },
    recordedAt: { type: Date },
    recordedBy: { type: String }
  },
  openedAt: { type: Date, default: Date.now },
  openedBy: { type: String, required: true },
  closedAt: { type: Date }
}, { versionKey: false });
schema.index({ projectId: 1, status: 1 });
module.exports = mongoose.model('VerificationCase', schema, 'verificationCases');
