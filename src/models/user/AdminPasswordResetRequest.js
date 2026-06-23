const mongoose = require('mongoose');

const adminPasswordResetRequestSchema = new mongoose.Schema({
  requestId: {
    type: String,
    required: true,
    unique: true
  },
  userid: {
    type: String,
    required: true,
    index: true
  },
  email: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'completed'],
    default: 'pending',
    index: true
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  resolvedBy: {
    type: String,
    default: null
  },
  token: {
    type: String,
    default: null
  },
  tokenExpiresAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  collection: 'adminpasswordresetrequests'
});

// Note: createdAt index is created automatically by timestamps:true (Mongoose 8)
adminPasswordResetRequestSchema.index({ token: 1 });


module.exports = mongoose.model('AdminPasswordResetRequest', adminPasswordResetRequestSchema);
