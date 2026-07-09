const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  assetId: { type: String, required: true, unique: true },
  projectId: { type: String, required: true, index: true },
  organizationId: { type: String, required: true, index: true },
  siteId: { type: String, index: true },
  assetType: {
    type: String,
    enum: ['COOKSTOVE', 'ENERGY_METER', 'FUEL_METER', 'SENSOR', 'GATEWAY', 'KITCHEN', 'PARTICIPANT_RECORD', 'OTHER'],
    required: true
  },
  name: { type: String, required: true },
  serialNumber: { type: String },
  model: { type: String },
  manufacturer: { type: String },
  installedAt: { type: Date },
  status: { type: String, enum: ['PLANNED', 'ACTIVE', 'MAINTENANCE', 'RETIRED'], default: 'PLANNED' },
  evidenceIds: [{ type: String }],
  attributes: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdBy: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

schema.index({ projectId: 1, assetType: 1 });
schema.index({ projectId: 1, status: 1 });

module.exports = mongoose.model('MRVAsset', schema, 'mrvAssets');
