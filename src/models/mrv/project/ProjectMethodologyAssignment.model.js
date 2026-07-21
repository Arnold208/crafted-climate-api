const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  assignmentId: { type: String, required: true, unique: true },
  projectId: { type: String, required: true, index: true },
  standardVersionId: { type: String, required: true },
  methodologyVersionId: { type: String, required: true },
  methodologyId: { type: String, required: true },
  implementationId: { type: String, required: true },
  selectionStatus: {
    type: String,
    enum: ['CANDIDATE', 'APPLICABILITY_PENDING', 'APPLICABILITY_APPROVED', 'BLOCKED', 'SUPERSEDED'],
    default: 'CANDIDATE'
  },
  externalValidationStatus: {
    type: String,
    enum: ['NOT_SUBMITTED', 'SUBMITTED', 'VALIDATED', 'CONDITIONALLY_VALIDATED', 'REJECTED'],
    default: 'NOT_SUBMITTED'
  },
  selectedAt: { type: Date, default: Date.now },
  selectedBy: { type: String },
  applicabilityApprovedAt: { type: Date },
  applicabilityApprovedBy: { type: String },
  blockedReason: { type: String },
  supersededAt: { type: Date },
  supersededBy: { type: String },
  supersededReason: { type: String },
  notes: { type: String }
}, { versionKey: false });
schema.index({ projectId: 1, selectionStatus: 1 });
module.exports = mongoose.model('ProjectMethodologyAssignment', schema, 'projectMethodologyAssignments');
