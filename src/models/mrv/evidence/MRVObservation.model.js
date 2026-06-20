const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  observationId: { type: String, required: true, unique: true },
  receiptId: { type: String, required: true, index: true },
  ingestionId: { type: String, required: true },
  projectId: { type: String, index: true },
  monitoringPeriodId: { type: String, index: true },
  siteId: { type: String },
  installationId: { type: String },
  auid: { type: String, index: true },
  model: { type: String },
  organizationId: { type: String },
  observedAt: { type: Date, default: null }, // null if unknown
  receivedAt: { type: Date, required: true },
  timeSource: { type: String },
  clockQuality: { type: String },
  measurements: { type: mongoose.Schema.Types.Mixed, default: {} }, // raw normalized values
  derivedValues: { type: mongoose.Schema.Types.Mixed, default: {} }, // aqi, battery%, etc.
  normalizationVersion: { type: String },
  qualityStatus: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'ACCEPTED_WITH_WARNING', 'QUARANTINED', 'REJECTED', 'MANUALLY_APPROVED', 'SUBSTITUTED', 'SUPERSEDED', 'VOIDED'],
    default: 'PENDING'
  },
  qualityWarnings: [{ type: String }],
  validationRunId: { type: String },
  qualificationResults: [{
    methodologyVersionId: { type: String },
    implementationId: { type: String },
    channel: { type: String },
    qualification: {
      type: String,
      enum: ['QUALIFIED_CALCULATION_INPUT', 'SUPPORTING_EVIDENCE_ONLY', 'NOT_QUALIFIED', 'SUPPORTING_MONITORING_INPUT', 'SUPPORTING_ENVIRONMENTAL_INPUT']
    },
    reason: { type: String },
    _id: false
  }],
  supersededById: { type: String },
  manualReviewDecision: {
    decision: String,
    reason: String,
    reviewedBy: String,
    reviewedAt: Date
  },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });
schema.index({ projectId: 1, monitoringPeriodId: 1, observedAt: -1 });
schema.index({ auid: 1, observedAt: -1 });
schema.index({ qualityStatus: 1, projectId: 1 });
module.exports = mongoose.model('MRVObservation', schema, 'mrvObservations');
