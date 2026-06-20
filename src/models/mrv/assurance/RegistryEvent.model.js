'use strict';
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  projectId: { type: String, required: true, index: true },
  organizationId: { type: String },
  registry: {
    type: String,
    enum: ['VERRA_VCS', 'GHANA_CMO', 'GOLD_STANDARD', 'CDM', 'OTHER'],
    required: true
  },
  eventType: {
    type: String,
    enum: [
      'PROJECT_REGISTRATION_SUBMITTED', 'PROJECT_REGISTRATION_APPROVED', 'PROJECT_REGISTRATION_REJECTED',
      'VALIDATION_REPORT_SUBMITTED', 'VALIDATION_COMPLETED', 'VALIDATION_REJECTED',
      'MONITORING_REPORT_SUBMITTED', 'VERIFICATION_REPORT_SUBMITTED', 'VERIFICATION_COMPLETED',
      'VCU_ISSUANCE_REQUESTED', 'VCU_ISSUED', 'VCU_CANCELLED', 'VCU_RETIRED',
      'CMO_AUTHORISATION_SUBMITTED', 'CMO_AUTHORISATION_GRANTED', 'CMO_AUTHORISATION_REJECTED',
      'CORRESPONDING_ADJUSTMENT_APPLIED', 'PROJECT_CLOSED', 'OTHER'
    ],
    required: true
  },
  eventDate: { type: Date, required: true },
  description: { type: String },
  externalRef: { type: String },
  unitsIssued: { type: Number },
  unitsRetired: { type: Number,  },
  serialNumbers: [{ type: String }],
  evidenceIds: [{ type: String }],
  recordedBy: { type: String },
  recordedAt: { type: Date, default: Date.now },
  notes: { type: String }
}, { versionKey: false });
schema.index({ projectId: 1, eventDate: -1 });
schema.index({ projectId: 1, eventType: 1 });
module.exports = mongoose.model('RegistryEvent', schema, 'registryEvents');
