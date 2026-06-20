const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  standardVersionId: { type: String, required: true, unique: true }, // 'VERRA-VCS-5.0'
  standardId: { type: String, required: true, index: true },
  version: { type: String, required: true },
  issuedAt: { type: Date },
  effectiveAt: { type: Date },
  transitionDeadline: { type: Date }, // for TRANSITION status
  corrections: [{
    code: { type: String },
    issuedAt: { type: Date },
    description: { type: String },
    required: { type: Boolean, default: true },
    _id: false
  }],
  status: { type: String, enum: ['ACTIVE', 'TRANSITION', 'SUPERSEDED', 'WITHDRAWN'], default: 'ACTIVE' },
  isDefault: { type: Boolean, default: false }, // only one should be true per standard
  notes: { type: String },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });
schema.index({ standardId: 1, status: 1 });
module.exports = mongoose.model('MRVStandardVersion', schema, 'mrvStandardVersions');
