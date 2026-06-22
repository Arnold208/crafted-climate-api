'use strict';
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  reportId:           { type: String, required: true, unique: true },
  projectId:          { type: String, required: true, index: true },
  monitoringPeriodId: { type: String, required: true, index: true },
  calculationRunId:   { type: String },
  reportVersion:      { type: Number, default: 1 },
  status:             { type: String, enum: ['DRAFT', 'FINAL', 'SUBMITTED'], default: 'DRAFT' },
  format:             { type: String, enum: ['JSON', 'PDF'], default: 'JSON' },
  blobUrl:            { type: String },   // Azure blob path for PDF
  sha256:             { type: String },   // hash for immutability proof
  generatedAt:        { type: Date, default: Date.now },
  generatedBy:        { type: String },
  sections:           { type: mongoose.Schema.Types.Mixed, default: {} }, // full JSON report data

  // ── Submission tracking ────────────────────────────────────────────────────
  // Populated when status transitions FINAL → SUBMITTED via the 2-step submit flow.
  // Step 1: POST /report/submit          — Admin A initiates (PENDING_COUNTERSIGN)
  // Step 2: POST /report/submit/countersign — Admin B confirms (CONFIRMED → SUBMITTED)
  submittedAt:     { type: Date },
  submittedBy:     { type: String },   // userid of the countersigning admin
  submittedTo:     { type: String, enum: ['VERRA_VCS', 'GOLD_STANDARD', 'GHANA_CMO', 'CDM', 'OTHER'] },
  submissionNotes: { type: String },

  // Pending countersign request — created in Step 1, cleared after Step 2
  submissionRequest: {
    requestedBy: { type: String },     // Admin A userid
    requestedAt: { type: Date },
    expiresAt:   { type: Date },       // 48 hours after request
    registry:    { type: String, enum: ['VERRA_VCS', 'GOLD_STANDARD', 'GHANA_CMO', 'CDM', 'OTHER'] },
    notes:       { type: String },
    status:      { type: String, enum: ['PENDING_COUNTERSIGN', 'CONFIRMED', 'EXPIRED', 'CANCELLED'] },
  },
}, { versionKey: false });

schema.index({ projectId: 1, monitoringPeriodId: 1, reportVersion: -1 });

module.exports = mongoose.model('MRVReport', schema, 'mrvReports');
