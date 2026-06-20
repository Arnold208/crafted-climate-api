const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  methodologyVersionId: { type: String, required: true, unique: true }, // 'VERRA-VM0050-1.0'
  methodologyId: { type: String, required: true, index: true },
  standardId: { type: String, required: true },
  version: { type: String, required: true },
  issuedAt: { type: Date },
  effectiveAt: { type: Date },
  corrections: [{ code: String, issuedAt: Date, required: Boolean, _id: false }],
  tools: [{ toolId: String, name: String, version: String, required: Boolean, _id: false }],
  templates: [{ templateId: String, name: String, url: String, _id: false }],
  status: { type: String, enum: ['ACTIVE', 'SUPERSEDED', 'WITHDRAWN'], default: 'ACTIVE' },
  documentHash: { type: String }, // SHA-256 of official document
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });
schema.index({ methodologyId: 1, status: 1 });
module.exports = mongoose.model('MRVMethodologyVersion', schema, 'mrvMethodologyVersions');
