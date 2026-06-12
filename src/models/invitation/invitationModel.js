const mongoose = require('mongoose');

const invitationSchema = new mongoose.Schema({
  invitationId: {
    type: String,
    required: true,
    unique: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true
  },
  organizationId: {
    type: String,
    required: true
  },
  accessLevel: {
    type: String,
    enum: ['org-admin', 'org-support', 'org-user', 'viewer', 'editor', 'admin', 'support', 'user'],
    required: true
  },
  needsSignUp: {
    type: Boolean,
    default: false
  },
  accepted: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  },
  expiresAt: {
    type: Date,
    required: true
  }
});


const Invitation = mongoose.model('Invitation', invitationSchema);

module.exports = Invitation;
