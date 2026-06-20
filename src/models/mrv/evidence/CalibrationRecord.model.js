const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  calibrationId: { type: String, required: true, unique: true },
  installationId: { type: String, index: true },
  auid: { type: String, required: true, index: true },
  devid: { type: String },
  projectId: { type: String, index: true },
  channel: { type: String, required: true }, // 'equivalent_co2', 'electricity_kwh'
  method: { type: String },
  laboratory: { type: String },
  calibratedAt: { type: Date },
  validFrom: { type: Date, required: true },
  validTo: { type: Date },
  accuracyClass: { type: String },
  rangeMin: { type: Number },
  rangeMax: { type: Number },
  unit: { type: String },
  traceabilityStandard: { type: String },
  certificateEvidenceId: { type: String },
  nextCalibrationDue: { type: Date },
  status: { type: String, enum: ['VALID', 'EXPIRED', 'SUPERSEDED', 'VOID'], default: 'VALID' },
  supersededById: { type: String },
  notes: { type: String },
  createdBy: { type: String },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });
schema.index({ auid: 1, channel: 1, validFrom: -1 });
module.exports = mongoose.model('CalibrationRecord', schema, 'calibrationRecords');
