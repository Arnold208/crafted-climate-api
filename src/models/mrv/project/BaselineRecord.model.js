const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  baselineId: { type: String, required: true, unique: true },
  projectId: { type: String, required: true, index: true },
  organizationId: { type: String, required: true, index: true },
  version: { type: Number, default: 1 },
  baselineType: { type: String, enum: ['CLEAN_COOKING', 'ENERGY', 'OTHER'], default: 'CLEAN_COOKING' },
  baselineTechnology: { type: String },
  projectTechnology: { type: String },
  baselineFuel: { type: String },
  projectFuel: { type: String },
  householdCount: { type: Number },
  sampleSize: { type: Number },
  annualBaselineConsumption: { type: Number },
  annualBaselineUnit: { type: String },
  evidenceIds: [{ type: String }],
  assumptions: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'SUPERSEDED'], default: 'DRAFT' },
  notes: { type: String },
  createdBy: { type: String },
  approvedBy: { type: String },
  approvedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

schema.index({ projectId: 1, status: 1 });

module.exports = mongoose.model('BaselineRecord', schema, 'baselineRecords');
