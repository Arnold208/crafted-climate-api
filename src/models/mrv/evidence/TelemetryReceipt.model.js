const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  receiptId: { type: String, required: true, unique: true },
  ingestionId: { type: String, required: true, unique: true },
  idempotencyKey: { type: String, required: true }, // primary dedup key — unique index via schema.index() below
  sourceEventId: { type: String, index: true },
  transport: {
    type: String,
    enum: ['notehub-mqtt', 'socketio', 'http-ingest', 'manual'],
    required: true
  },
  sourceTopic: { type: String },
  devid: { type: String, index: true },
  auid: { type: String, index: true },
  model: { type: String },
  organizationId: { type: String, index: true },
  projectIds: [{ type: String }],
  receivedAt: { type: Date, required: true },
  observedAt: { type: Date, default: null }, // null if unknown
  timeSource: {
    type: String,
    enum: ['device', 'notehub', 'server-received', 'manually-corrected', 'invalid-device-time'],
    default: 'server-received'
  },
  clockQuality: {
    type: String,
    enum: ['trusted', 'synchronised', 'device-reported', 'transport-derived', 'unverified', 'invalid'],
    default: 'unverified'
  },
  rawBlobPath: { type: String },
  rawBlobContainer: { type: String, default: 'mrv-raw' },
  rawBlobHash: { type: String }, // SHA-256
  status: {
    type: String,
    enum: ['PENDING', 'STORED', 'OBSERVATION_CREATED', 'VALIDATED', 'DUPLICATE', 'UNRESOLVED', 'QUARANTINED', 'FAILED'],
    default: 'PENDING'
  },
  observationId: { type: String },
  rejectionReason: { type: String },
  quarantineReason: { type: String },
  retentionClass: { type: String, enum: ['OPERATIONAL', 'MRV'], default: 'OPERATIONAL' },
  sequenceNumber: { type: Number },
  firmwareVersion: { type: String },
  schemaVersion: { type: String, default: '1.0.0' },
  processingAttempts: { type: Number, default: 0 },
  lastProcessingError: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });
schema.index({ auid: 1, receivedAt: -1 });
schema.index({ projectIds: 1, observedAt: -1 });
schema.index({ status: 1, retentionClass: 1 });
schema.index({ idempotencyKey: 1 }, { unique: true });
module.exports = mongoose.model('TelemetryReceipt', schema, 'telemetryReceipts');
