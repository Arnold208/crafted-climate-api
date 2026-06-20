const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  monitoringPeriodId: { type: String, required: true, unique: true },
  projectId: { type: String, required: true, index: true },
  assignmentId: { type: String },
  organizationId: { type: String, required: true },
  name: { type: String },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: {
    type: String,
    enum: ['DRAFT', 'OPEN', 'CLOSED', 'CALCULATION_IN_PROGRESS', 'CALCULATION_COMPLETE', 'CALCULATION_APPROVED', 'SUBMITTED', 'VERIFIED'],
    default: 'DRAFT'
  },
  readinessAssessmentId: { type: String },
  readinessPassedAt: { type: Date },
  openedAt: { type: Date },
  openedBy: { type: String },
  closedAt: { type: Date },
  closedBy: { type: String },
  calculationRunIds: [{ type: String }],
  completenessSnapshot: { type: mongoose.Schema.Types.Mixed },
  notes: { type: String },
  createdBy: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });
schema.index({ projectId: 1, status: 1 });
module.exports = mongoose.model('MonitoringPeriod', schema, 'monitoringPeriods');
