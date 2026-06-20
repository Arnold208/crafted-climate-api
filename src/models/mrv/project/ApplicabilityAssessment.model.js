const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  assessmentId: { type: String, required: true, unique: true },
  assignmentId: { type: String, required: true, index: true },
  projectId: { type: String, required: true, index: true },
  conditions: [{
    conditionCode: { type: String, required: true },
    section: { type: String },
    requirementText: { type: String },
    result: {
      type: String,
      enum: ['PASS', 'FAIL', 'PARTIAL', 'NOT_YET_PROVEN', 'NOT_APPLICABLE'],
      default: 'NOT_YET_PROVEN'
    },
    evidenceIds: [{ type: String }],
    notes: { type: String },
    assessedBy: { type: String },
    assessedAt: { type: Date },
    _id: false
  }],
  overallResult: {
    type: String,
    enum: ['PASS', 'FAIL', 'PARTIAL', 'NOT_YET_ASSESSED'],
    default: 'NOT_YET_ASSESSED'
  },
  approvedBy: { type: String },
  approvedAt: { type: Date },
  version: { type: Number, default: 1 },
  supersededById: { type: String },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });
module.exports = mongoose.model('ApplicabilityAssessment', schema, 'applicabilityAssessments');
