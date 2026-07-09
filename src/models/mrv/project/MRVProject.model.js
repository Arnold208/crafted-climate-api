const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  projectId: { type: String, required: true, unique: true }, // 'CC-COOK-001'
  organizationId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  description: { type: String },
  activityType: {
    type: String,
    enum: ['CLEAN_COOKING', 'RENEWABLE_ENERGY', 'ENERGY_EFFICIENCY', 'RICE_MANAGEMENT', 'AGRICULTURE', 'WASTEWATER', 'BIOCHAR', 'FORESTRY', 'WETLAND_RESTORATION', 'GRASSLAND', 'LANDFILL_GAS', 'ENTERIC_METHANE', 'OTHER'],
    required: true
  },
  claimType: {
    type: String,
    enum: ['GHG_REDUCTION', 'GHG_REMOVAL', 'CO_BENEFIT', 'ENVIRONMENTAL_COMMODITY'],
    required: true
  },
  projectTechnology: { type: String },
  baselineTechnology: { type: String },
  gases: [{ type: String }], // ['CO2', 'CH4', 'N2O']
  country: { type: String, default: 'GH' },
  region: { type: String },
  // GeoJSON project boundary — use MultiPolygon for projects spanning multiple geographic clusters
  // e.g. clean cooking households across Accra + Kumasi + Takoradi = 3 separate Polygons in one MultiPolygon
  boundary: {
    type: { type: String, enum: ['Polygon', 'MultiPolygon', 'GeometryCollection'], default: 'MultiPolygon' },
    coordinates: { type: mongoose.Schema.Types.Mixed } // flexible nested array: [[ring]] or [[[r1]],[[r2]]]
  },
  projectStart: { type: Date },
  creditingPeriodStart: { type: Date },
  creditingPeriodEnd: { type: Date },
  monitoringPeriodStart: { type: Date },
  dataCollectionStart: { type: Date },
  status: {
    type: String,
    enum: [
      'SANDBOX',
      'CANDIDATE',
      'APPLICABILITY_REVIEW',
      'LEGAL_REVIEW',
      'READY_FOR_MONITORING',
      'MONITORING',
      'CALCULATION',
      'VVB_VERIFICATION',
      'VERRA_REVIEW',
      'ISSUANCE_COMPLETE',
      'PROJECT_CLOSED',
      'WITHDRAWN',
      'SUSPENDED'
    ],
    default: 'CANDIDATE'
  },
  sandboxFlag: { type: Boolean, default: false }, // SANDBOX_NON_CREDITING marker
  sandboxNote: { type: String },
  selectedStandardVersionId: { type: String },
  ghanaPathway: {
    type: { type: String, enum: ['VOLUNTARY_ONLY', 'ARTICLE_6_2', 'ARTICLE_6_4', 'UNDETERMINED'], default: 'UNDETERMINED' },
    cmoEngagementStatus: { type: String, enum: ['NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'NOT_REQUIRED'], default: 'NOT_STARTED' },
    cmoReference: { type: String },
    cmoNotes: { type: String },
    authorisationRequired: { type: Boolean, default: null },
    correspondingAdjustmentRequired: { type: Boolean, default: null }
  },
  epaRelationships: [{
    party: { type: String },
    relationshipType: { type: String },
    scope: { type: String },
    note: { type: String },
    documents: [{ type: String }],
    _id: false
  }],
  rights: {
    landRightsStatus: { type: String, enum: ['NOT_ASSESSED', 'CONFIRMED', 'PENDING', 'ISSUE_IDENTIFIED'], default: 'NOT_ASSESSED' },
    carbonRightsStatus: { type: String, enum: ['NOT_ASSESSED', 'CONFIRMED', 'PENDING', 'ISSUE_IDENTIFIED'], default: 'NOT_ASSESSED' },
    participantAuthorityStatus: { type: String, enum: ['NOT_ASSESSED', 'CONFIRMED', 'PENDING', 'ISSUE_IDENTIFIED'], default: 'NOT_ASSESSED' },
    benefitSharingStatus: { type: String, enum: ['NOT_ASSESSED', 'CONFIRMED', 'PENDING', 'ISSUE_IDENTIFIED'], default: 'NOT_ASSESSED' },
    landRightsEvidenceId: { type: String },
    carbonRightsEvidenceId: { type: String }
  },
  safeguards: {
    stakeholderPlanStatus: { type: String, enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE'], default: 'NOT_STARTED' },
    esgRiskStatus: { type: String, enum: ['NOT_ASSESSED', 'LOW', 'MEDIUM', 'HIGH', 'MITIGATED'], default: 'NOT_ASSESSED' },
    grievanceMechanismStatus: { type: String, enum: ['NOT_STARTED', 'IN_PROGRESS', 'OPERATIONAL'], default: 'NOT_STARTED' },
    fpicRequired: { type: Boolean, default: null },
    fpicStatus: { type: String, enum: ['NOT_REQUIRED', 'PENDING', 'COMPLETE'], default: 'NOT_REQUIRED' }
  },
  dataGovernance: {
    privacyNoticeApproved: { type: Boolean, default: false },
    dpcRegistered: { type: Boolean, default: false },
    consentFormsReady: { type: Boolean, default: false },
    dataProcessingAgreementSigned: { type: Boolean, default: false },
    pseudonymousParticipantIds: { type: Boolean, default: false }
  },
  members: [{
    userId: { type: String, required: true },
    role: {
      type: String,
      enum: ['mrv-project-manager', 'mrv-field-officer', 'mrv-data-reviewer', 'mrv-methodology-manager', 'mrv-report-manager', 'mrv-independent-verifier', 'mrv-programme-admin', 'mrv-auditor'],
      required: true
    },
    addedAt: { type: Date, default: Date.now },
    addedBy: { type: String },
    _id: false
  }],
  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null, index: true }
}, { versionKey: false });
schema.index({ organizationId: 1, status: 1 });
schema.index({ organizationId: 1, deletedAt: 1 });
module.exports = mongoose.model('MRVProject', schema, 'mrvProjects');
