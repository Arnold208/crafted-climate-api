const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  assessmentId: { type: String, required: true, unique: true },
  projectId: { type: String, required: true, index: true },
  monitoringPeriodId: { type: String },
  dimensions: [{
    dimension: {
      type: String,
      enum: ['PROGRAMME', 'METHODOLOGY', 'TECHNICAL', 'EVIDENCE', 'LEGAL', 'SAFEGUARDS', 'DATA_GOVERNANCE']
    },
    status: { type: String, enum: ['READY', 'GAPS_IDENTIFIED', 'BLOCKING_GAPS', 'NOT_ASSESSED'], default: 'NOT_ASSESSED' },
    gaps: [{
      description: { type: String },
      blocking: { type: Boolean, default: false },
      evidenceRequired: { type: String },
      status: { type: String, enum: ['OPEN', 'RESOLVED', 'WAIVED'], default: 'OPEN' },
      _id: false
    }],
    _id: false
  }],
  overallStatus: { type: String, enum: ['NOT_READY', 'GAPS_IDENTIFIED', 'READY'], default: 'NOT_READY' },
  runAt: { type: Date, default: Date.now },
  runBy: { type: String }
}, { versionKey: false });
schema.index({ projectId: 1, runAt: -1 });
module.exports = mongoose.model('ReadinessAssessment', schema, 'readinessAssessments');
