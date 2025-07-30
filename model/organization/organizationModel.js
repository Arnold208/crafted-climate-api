const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  organizationId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  deployments: {
    type: [String],
    default: []
  },
  collaborators: [{
    userId: {
      type: String,
      required: true
    },
    accessLevel: {
      type: String,
      enum: ['ADMIN', 'MODERATOR'],
      default: 'MODERATOR'
    },
    permissions: {
      type: [String],
      default: []
    }
  }]
});

const Organization = mongoose.model('Organization', organizationSchema);

module.exports = Organization;
