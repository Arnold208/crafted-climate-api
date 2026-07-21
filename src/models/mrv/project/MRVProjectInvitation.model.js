const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  invitationId: { type: String, required: true, unique: true },
  token: { type: String, required: true, unique: true },
  email: { type: String, required: true, index: true },
  projectId: { type: String, required: true, index: true },
  organizationId: { type: String, required: true, index: true },
  orgRole: { type: String, default: 'org-user' },
  mrvRole: {
    type: String,
    enum: ['mrv-project-manager', 'mrv-field-officer', 'mrv-data-reviewer', 'mrv-methodology-manager', 'mrv-report-manager', 'mrv-independent-verifier', 'mrv-programme-admin', 'mrv-auditor'],
    required: true
  },
  needsSignUp: { type: Boolean, default: false },
  accepted: { type: Boolean, default: false },
  invitedBy: { type: String },
  acceptedBy: { type: String },
  acceptedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });

schema.index({ projectId: 1, accepted: 1 });
schema.index({ organizationId: 1, email: 1, accepted: 1 });

module.exports = mongoose.model('MRVProjectInvitation', schema, 'mrvProjectInvitations');
