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
}, { versionKey: false });

schema.index({ projectId: 1, monitoringPeriodId: 1, reportVersion: -1 });

module.exports = mongoose.model('MRVReport', schema, 'mrvReports');
