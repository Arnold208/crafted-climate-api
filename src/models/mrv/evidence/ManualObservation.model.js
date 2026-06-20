const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  manualObservationId: { type: String, required: true, unique: true },
  projectId: { type: String, required: true, index: true },
  monitoringPeriodId: { type: String, index: true },
  siteId: { type: String },
  organizationId: { type: String, required: true },
  parameterId: { type: String, required: true }, // 'VERRA-VM0050-PARAM-PROJECT-ELECTRICITY-CONSUMPTION'
  parameterName: { type: String },
  value: { type: Number, required: true },
  unit: { type: String, required: true },
  observedAt: { type: Date, required: true },
  enteredAt: { type: Date, default: Date.now },
  sourceType: {
    type: String,
    enum: ['MANUAL_METER_READING', 'MANUAL_SURVEY', 'MANUAL_LOG', 'MANUAL_KEY_VALUE', 'CALCULATED'],
    required: true
  },
  readingType: {
    type: String,
    enum: ['CUMULATIVE', 'INCREMENTAL', 'INSTANTANEOUS'],
    default: 'INSTANTANEOUS'
  },
  meterAssetId: { type: String },
  previousReadingId: { type: String }, // for cumulative: link to prev reading
  previousValue: { type: Number },
  operatorId: { type: String, required: true },
  observerName: { type: String },
  evidenceIds: [{ type: String }],
  attributes: { type: mongoose.Schema.Types.Mixed, default: {} },
  notes: { type: String },
  status: {
    type: String,
    enum: ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED'],
    default: 'PENDING_REVIEW'
  },
  approvedBy: { type: String },
  approvedAt: { type: Date },
  rejectedBy: { type: String },
  rejectedAt: { type: Date },
  rejectionReason: { type: String },
  supersededById: { type: String },
  correctionReason: { type: String },
  methodologyQualification: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });
schema.index({ projectId: 1, monitoringPeriodId: 1, observedAt: -1 });
schema.index({ projectId: 1, parameterId: 1, observedAt: -1 });
module.exports = mongoose.model('ManualObservation', schema, 'manualObservations');
