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
  description: { type: String },
  assetTag: { type: String },
  serialNumber: { type: String },
  model: { type: String },
  manufacturer: { type: String },
  installedAt: { type: Date },
  locationDescription: { type: String },
  ownershipType: { type: String, enum: ['PROJECT_OWNED', 'PARTICIPANT_OWNED', 'LEASED', 'PARTNER_OWNED', 'UNKNOWN'], default: 'UNKNOWN' },
  quantity: { type: Number, default: 1 },
  status: { type: String, enum: ['PLANNED', 'ACTIVE', 'MAINTENANCE', 'RETIRED'], default: 'PLANNED' },
  evidenceIds: [{ type: String }],
  attributes: { type: mongoose.Schema.Types.Mixed, default: {} },
  revisionHistory: [{
    revisedAt: { type: Date, default: Date.now },
    revisedBy: { type: String },
    reason: { type: String },
    previous: { type: mongoose.Schema.Types.Mixed },
    changes: { type: mongoose.Schema.Types.Mixed },
  }],
  createdBy: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

schema.index({ projectId: 1, assetType: 1 });
schema.index({ projectId: 1, status: 1 });
schema.index({ projectId: 1, siteId: 1 });

module.exports = mongoose.model('MRVAsset', schema, 'mrvAssets');
