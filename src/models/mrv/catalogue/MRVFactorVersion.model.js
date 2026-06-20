const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  factorVersionId: { type: String, required: true, unique: true },
  factorId: { type: String, required: true, index: true },
  value: { type: Number, required: true },
  uncertainty: { type: Number },
  unit: { type: String, required: true },
  effectiveFrom: { type: Date, required: true },
  effectiveTo: { type: Date },
  sourceDocument: { type: String },
  sourceDocumentHash: { type: String },
  approvedBy: { type: String },
  approvedAt: { type: Date },
  status: { type: String, enum: ['ACTIVE', 'SUPERSEDED', 'WITHDRAWN'], default: 'ACTIVE' },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });
schema.index({ factorId: 1, effectiveFrom: -1 });
module.exports = mongoose.model('MRVFactorVersion', schema, 'mrvFactorVersions');
