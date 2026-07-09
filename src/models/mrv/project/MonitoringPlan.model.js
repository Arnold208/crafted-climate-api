const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  monitoringPlanId: { type: String, required: true, unique: true },
  projectId: { type: String, required: true, index: true },
  organizationId: { type: String, required: true, index: true },
  version: { type: Number, default: 1 },
  dataCollectionStart: { type: Date },
  monitoringFrequency: { type: String, enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'PER_PERIOD'], default: 'MONTHLY' },
  requiredParameters: [{
    parameterId: String,
    name: String,
    unit: String,
    sourceType: String,
    frequency: String,
    responsibleRole: String,
    _id: false
  }],
  evidenceRequirements: [{
    evidenceType: String,
    description: String,
    frequency: String,
    responsibleRole: String,
    _id: false
  }],
  missingDataProcedure: { type: String },
  qaQcProcedure: { type: String },
  status: { type: String, enum: ['DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'SUPERSEDED'], default: 'DRAFT' },
  notes: { type: String },
  createdBy: { type: String },
  approvedBy: { type: String },
  approvedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

schema.index({ projectId: 1, status: 1 });

module.exports = mongoose.model('MonitoringPlan', schema, 'monitoringPlans');
