const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  partnerId: { type: String, required: true, unique: true },
  projectId: { type: String, required: true }, // indexed via schema.index() below
  organizationName: { type: String, required: true },
  internalOrganizationId: { type: String }, // if they have a CraftedClimate org account
  roles: [{
    type: String,
    enum: [
      'PROJECT_DEVELOPER',
      'REGULATORY_COORDINATION',
      'CARBON_MARKET_COORDINATION',
      'STAKEHOLDER_ENGAGEMENT',
      'DMRV_PLATFORM_PROVIDER',
      'SENSOR_PROVIDER',
      'DATA_PROCESSING_PROVIDER',
      'CALCULATION_SUPPORT',
      'REPORTING_SUPPORT',
      'PROJECT_OWNER',
      'CARBON_RIGHTS_HOLDER',
      'VVB',
      'LABORATORY'
    ]
  }],
  agreementStatus: {
    type: String,
    enum: ['NOT_STARTED', 'DRAFT', 'UNDER_REVIEW', 'EXECUTED', 'TERMINATED'],
    default: 'NOT_STARTED'
  },
  effectiveFrom: { type: Date },
  effectiveTo: { type: Date },
  documents: [{ type: String }], // evidenceIds of signed agreements
  contacts: [{
    name: String,
    role: String,
    email: String,
    phone: String,
    _id: false
  }],
  epaRelationshipType: { type: String }, // e.g. 'EPA_AIR_QUALITY_DATA_PARTNERSHIP'
  epaRelationshipNote: { type: String }, // explicit: NOT carbon-market approval
  notes: { type: String },
  createdBy: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });
schema.index({ projectId: 1 });
module.exports = mongoose.model('MRVProjectPartner', schema, 'mrvProjectPartners');
