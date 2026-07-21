const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  installationId: { type: String, required: true, unique: true },
  projectId:      { type: String, required: true }, // indexed via schema.index() below
  siteId:         { type: String, index: true },
  organizationId: { type: String, required: true, index: true },

  // Device identifiers
  auid:  { type: String, required: true, index: true },
  devid: { type: String },
  model: { type: String }, // 'gas-solo', 'env', 'aqua', etc.

  // Validity window — open-ended (validTo = null) until replaced/decommissioned
  validFrom: { type: Date, required: true },
  validTo:   { type: Date, default: null }, // set when REPLACED or DECOMMISSIONED

  // Physical location
  coordinates:         { type: [Number] }, // [lng, lat]
  positionDescription: { type: String },

  // Technical configuration
  approvedFirmwareVersions: [{ type: String }],
  selectedParameters: [{ type: String }],
  suitabilitySnapshot: { type: mongoose.Schema.Types.Mixed },
  frequency: { type: Number, default: 30 }, // minutes between readings, same as registered device schedule
  batch: { type: Number, default: 2 }, // readings per transmit batch, same as registered device schedule
  batchWindowMinutes: { type: Number, default: 60 },
  inboundGraceMinutes: { type: Number, default: 5 },
  expectedFrequencySeconds: { type: Number, default: 1800 }, // derived from frequency * 60
  installationNotes:        { type: String },
  evidenceIds:              [{ type: String }], // photo IDs of physical installation

  // ── Status lifecycle ─────────────────────────────────────────────────────
  // PLANNED      → registered but not yet physically installed
  // ACTIVE       → collecting data for the project
  // MAINTENANCE  → temporarily offline (calibration, firmware, repair) — data gap expected
  // REPLACED     → permanently swapped out; validTo is set; replacedByInstallationId points to successor
  // DECOMMISSIONED → project closed; all data collection ended
  //
  // REMOVAL RULES:
  //   - Records are NEVER deleted — only status changes (full audit trail)
  //   - ACTIVE → MAINTENANCE: temporary, device returns to ACTIVE after
  //   - ACTIVE/MAINTENANCE → REPLACED: device swapped, new installation created
  //   - ACTIVE → DECOMMISSIONED: only when project moves to CLOSED/COMPLETED
  status: {
    type: String,
    enum: ['PLANNED', 'ACTIVE', 'MAINTENANCE', 'REPLACED', 'DECOMMISSIONED'],
    default: 'PLANNED'
  },

  // Installation / removal tracking
  installedBy: { type: String },
  installedAt: { type: Date },

  // Maintenance window tracking
  maintenanceReason:         { type: String },
  maintenanceExpectedReturn: { type: Date },
  maintenanceStartedAt:      { type: Date },
  maintenanceStartedBy:      { type: String },
  maintenanceReturnedAt:     { type: Date },
  maintenanceReturnedBy:     { type: String },
  maintenanceNotes:          { type: String },

  // Replacement tracking
  replacedByInstallationId: { type: String }, // points to the successor installation
  replacedById:             { type: String }, // installationId of the device this replaced (if any)
  replacementReason:        { type: String, enum: ['FAULT', 'CALIBRATION_FAILURE', 'UPGRADE', 'THEFT', 'DAMAGE', 'OTHER'] },
  replacementNotes:         { type: String },
  replacedAt:               { type: Date },
  replacedBy:               { type: String },

  // Decommission tracking
  decommissionedAt:     { type: Date },
  decommissionedBy:     { type: String },
  decommissionReason:   { type: String },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

schema.index({ projectId: 1, auid: 1 });
schema.index({ projectId: 1, status: 1 });
schema.index({ auid: 1, status: 1 });
module.exports = mongoose.model('SensorInstallation', schema, 'sensorInstallations');


