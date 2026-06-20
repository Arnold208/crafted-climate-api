'use strict';
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  endpointId:     { type: String, required: true, unique: true },
  projectId:      { type: String, required: true, index: true },
  organizationId: { type: String, required: true, index: true },
  url:            { type: String, required: true },
  // HMAC-SHA256 secret — stored hashed in prod, plaintext for MVP
  secret:         { type: String, required: true },
  description:    { type: String },
  // Events this endpoint subscribes to
  events: [{
    type: String,
    enum: [
      'observation.created',
      'observation.quarantined',
      'observation.approved',
      'period.opened',
      'period.closed',
      'period.completeness',
      'verification.opinion',
      'installation.linked',
      'installation.maintenance',
      'installation.replaced',
    ]
  }],
  status:    { type: String, enum: ['ACTIVE', 'PAUSED', 'DISABLED'], default: 'ACTIVE' },
  createdBy: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

schema.index({ projectId: 1, status: 1 });
module.exports = mongoose.model('MRVWebhookEndpoint', schema, 'mrvWebhookEndpoints');
