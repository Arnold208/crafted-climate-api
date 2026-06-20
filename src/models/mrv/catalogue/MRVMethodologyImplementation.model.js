const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  implementationId: { type: String, required: true, unique: true }, // 'CC-VERRA-VM0050-1.0-1.0.0'
  methodologyVersionId: { type: String, required: true, index: true },
  methodologyId: { type: String, required: true },
  standardVersionId: { type: String, required: true },
  craftedClimateVersion: { type: String, required: true }, // '1.0.0'
  status: {
    type: String,
    enum: [
      'CATALOGUED',
      'REQUIREMENTS_MAPPING',
      'IMPLEMENTATION_IN_DEVELOPMENT',
      'INTERNAL_REVIEW',
      'INTERNALLY_TESTED',
      'APPROVED_FOR_PROJECT_DESIGN',
      'SUSPENDED',
      'SUPERSEDED',
      'RETIRED'
    ],
    default: 'CATALOGUED'
  },
  mayCalculate: { type: Boolean, default: false },
  gitCommit: { type: String },
  buildHash: { type: String },
  testSuiteHash: { type: String },
  approvedBy: { type: String },
  approvedAt: { type: Date },
  suspendedReason: { type: String },
  sensorCapabilityMappings: [{
    model: String,
    measurementCode: String,
    role: String,
    _id: false
  }],
  requiresSignOffConditions: [{ type: String }], // list of conditions still pending
  notes: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });
module.exports = mongoose.model('MRVMethodologyImplementation', schema, 'mrvMethodologyImplementations');
