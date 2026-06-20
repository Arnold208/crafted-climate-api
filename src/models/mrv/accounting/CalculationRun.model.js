const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  calculationRunId: { type: String, required: true, unique: true },
  projectId: { type: String, required: true, index: true },
  monitoringPeriodId: { type: String, required: true, index: true },
  assignmentId: { type: String, required: true },
  organizationId: { type: String, required: true },
  standardVersionId: { type: String, required: true },
  methodologyVersionId: { type: String, required: true },
  implementationId: { type: String, required: true },
  baselineVersionId: { type: String },
  factorVersionIds: [{ type: String }],
  acceptedObservationIds: [{ type: String }],
  acceptedManualObservationIds: [{ type: String }],
  externalEvidenceIds: [{ type: String }],
  excludedItems: [{ id: String, type: String, reason: String, _id: false }],
  inputDatasetHash: { type: String }, // SHA-256 of full frozen input set
  runVersion: { type: Number, default: 1 },
  status: {
    type: String,
    enum: ['QUEUED', 'RUNNING', 'SYSTEM_CALCULATED', 'FAILED', 'INTERNAL_REVIEW', 'APPROVED_FOR_SUBMISSION', 'VVB_VERIFIED', 'VERRA_APPROVED', 'VCUS_ISSUED'],
    default: 'QUEUED'
  },
  results: { type: mongoose.Schema.Types.Mixed, default: {} },
  intermediateValues: { type: mongoose.Schema.Types.Mixed, default: {} },
  uncertainty: { type: mongoose.Schema.Types.Mixed, default: {} },
  gitCommit: { type: String },
  buildHash: { type: String },
  runtimeMs: { type: Number },
  snapshotBlobPath: { type: String },
  calculatedAt: { type: Date },
  calculatedBy: { type: String },
  reviewedAt: { type: Date },
  reviewedBy: { type: String },
  reviewNotes: { type: String },
  approvedAt: { type: Date },
  approvedBy: { type: String },
  failureReason: { type: String },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });
schema.index({ projectId: 1, monitoringPeriodId: 1, runVersion: -1 });
module.exports = mongoose.model('CalculationRun', schema, 'calculationRuns');
