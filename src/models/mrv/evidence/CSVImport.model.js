const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  importId: { type: String, required: true, unique: true },
  projectId: { type: String, required: true, index: true },
  monitoringPeriodId: { type: String },
  organizationId: { type: String, required: true },
  originalFilename: { type: String, required: true },
  blobPath: { type: String, required: true },
  blobContainer: { type: String, default: 'mrv-evidence' },
  fileHash: { type: String, required: true }, // SHA-256
  schemaDetected: { type: String },
  columnMappings: [{
    csvColumn: String,
    parameterId: String,
    unit: String,
    conversionFactor: Number,
    _id: false
  }],
  mappingVersion: { type: String },
  rowSummary: {
    total: { type: Number, default: 0 },
    valid: { type: Number, default: 0 },
    warned: { type: Number, default: 0 },
    rejected: { type: Number, default: 0 },
    committed: { type: Number, default: 0 }
  },
  previewRows: [{ type: mongoose.Schema.Types.Mixed }], // first N rows for preview
  status: {
    type: String,
    enum: ['UPLOADED', 'PREVIEW_READY', 'COMMITTED', 'REJECTED', 'PARTIALLY_COMMITTED'],
    default: 'UPLOADED'
  },
  uploadedBy: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  committedAt: { type: Date },
  committedBy: { type: String },
  rejectedAt: { type: Date },
  rejectedBy: { type: String },
  rejectionReason: { type: String },
  auditEventId: { type: String },
  errors: [{ row: Number, message: String, _id: false }]
  // Note: 'errors' is a Mongoose reserved key. suppressReservedKeysWarning silences the startup warning.
  // It is intentionally used here to store row-level CSV import validation errors.
}, { versionKey: false, suppressReservedKeysWarning: true });

schema.index({ projectId: 1, uploadedAt: -1 });
module.exports = mongoose.model('CSVImport', schema, 'csvImports');
