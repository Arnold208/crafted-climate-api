const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  evidenceId: { type: String, required: true, unique: true },
  projectId: { type: String, required: true, index: true },
  monitoringPeriodId: { type: String, index: true },
  siteId: { type: String },
  organizationId: { type: String, required: true },
  evidenceType: {
    type: String,
    enum: [
      'CALIBRATION_CERTIFICATE', 'INSTALLATION_PHOTO', 'LAB_REPORT',
      'BASELINE_SURVEY', 'STOVE_REGISTRY', 'PARTICIPANT_REGISTRY',
      'FUEL_PURCHASE_RECORD', 'ELECTRICITY_BILL', 'SIGNED_AGREEMENT',
      'STAKEHOLDER_RECORD', 'FPIC_RECORD', 'ESG_RISK_ASSESSMENT',
      'CMO_APPROVAL', 'EPA_APPROVAL', 'LAND_RIGHTS_DOCUMENT',
      'CARBON_RIGHTS_DOCUMENT', 'BENEFIT_SHARING_AGREEMENT',
      'METER_READING_PHOTO', 'VIDEO', 'CSV_IMPORT', 'OTHER'
    ],
    required: true
  },
  title: { type: String },
  description: { type: String },
  activityDate: { type: Date },
  capturedAt: { type: Date },
  uploadedAt: { type: Date, default: Date.now },
  capturedBy: { type: String },
  uploadedBy: { type: String, required: true },
  mimeType: { type: String },
  fileSize: { type: Number },
  fileHash: { type: String }, // SHA-256
  blobPath: { type: String },
  blobContainer: { type: String, default: 'mrv-evidence' },
  location: {
    latitude: Number,
    longitude: Number,
    accuracyMetres: Number
  },
  relatedEntityType: { type: String },
  relatedEntityId: { type: String },
  source: { type: String }, // lab name, issuing authority, etc.
  status: {
    type: String,
    enum: ['PENDING_REVIEW', 'ACCEPTED', 'ACCEPTED_WITH_WARNING', 'REJECTED', 'SUPERSEDED'],
    default: 'PENDING_REVIEW'
  },
  reviewedBy: { type: String },
  reviewedAt: { type: Date },
  reviewNotes: { type: String },
  supersededById: { type: String },
  attributes: { type: mongoose.Schema.Types.Mixed, default: {} },
  largeFileUploadToken: { type: String }, // SAS token reference
  largeFileUploadExpiry: { type: Date }
}, { versionKey: false });
schema.index({ projectId: 1, evidenceType: 1, activityDate: -1 });
schema.index({ projectId: 1, monitoringPeriodId: 1 });
module.exports = mongoose.model('ExternalEvidenceRecord', schema, 'externalEvidenceRecords');
