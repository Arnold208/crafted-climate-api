'use strict';
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  grantId:        { type: String, required: true, unique: true },
  projectId:      { type: String, required: true, index: true },
  organizationId: { type: String, required: true },
  apiKey:         { type: String, required: true, unique: true, index: true }, // hashed in DB, raw sent once
  apiKeyPrefix:   { type: String, required: true },                             // first 10 chars for display
  scope:          { type: String, default: 'mrv:read-only' },
  vvbName:        { type: String },
  vvbEmail:       { type: String },
  issuedBy:       { type: String, required: true },
  issuedAt:       { type: Date, default: Date.now },
  expiresAt:      { type: Date, required: true }, // indexed via TTL schema.index below

  revokedAt:      { type: Date, default: null },
  revokedBy:      { type: String, default: null },
  lastUsedAt:     { type: Date, default: null },
  useCount:       { type: Number, default: 0 },
  status:         { type: String, enum: ['ACTIVE', 'EXPIRED', 'REVOKED'], default: 'ACTIVE' }
}, { versionKey: false });

schema.index({ projectId: 1, status: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index — auto-delete expired grants

module.exports = mongoose.model('MRVVVBAccessGrant', schema, 'mrvVVBAccessGrants');
