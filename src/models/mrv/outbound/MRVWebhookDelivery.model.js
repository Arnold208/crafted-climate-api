'use strict';
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  deliveryId:  { type: String, required: true, unique: true },
  endpointId:  { type: String, required: true, index: true },
  projectId:   { type: String, required: true, index: true },
  event:       { type: String, required: true },
  payload:     { type: mongoose.Schema.Types.Mixed },
  // Delivery outcome
  status:       { type: String, enum: ['PENDING', 'DELIVERED', 'FAILED', 'ABANDONED'], default: 'PENDING' },
  attempts:     { type: Number, default: 0 },
  lastAttemptAt:{ type: Date },
  responseCode: { type: Number },
  responseBody: { type: String },
  errorMessage: { type: String },
  // Timing
  enqueuedAt:   { type: Date, default: Date.now },
  deliveredAt:  { type: Date },
  createdAt:    { type: Date, default: Date.now },
}, { versionKey: false });

schema.index({ endpointId: 1, status: 1 });
schema.index({ projectId: 1, createdAt: -1 });
module.exports = mongoose.model('MRVWebhookDelivery', schema, 'mrvWebhookDeliveries');
