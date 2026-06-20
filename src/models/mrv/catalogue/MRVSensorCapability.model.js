const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  capabilityId: { type: String, required: true, unique: true },
  model: { type: String, required: true, enum: ['env', 'aqua', 'gas-solo', 'flow', 'terra', 'manual-meter', 'other'] },
  measurementCode: { type: String, required: true },
  description: { type: String },
  unit: { type: String },
  roles: [{
    type: String,
    enum: [
      'CO_BENEFIT',
      'USAGE_CROSS_CHECK',
      'SUPPORTING_EVIDENCE_ONLY',
      'QUALIFIED_CALCULATION_INPUT',
      'SUPPORTING_MONITORING_INPUT',
      'SUPPORTING_ENVIRONMENTAL_INPUT',
      'DIRECT_CO2E_QUANTIFICATION'
    ]
  }],
  prohibitedRoles: [{ type: String }],
  methodologyMappings: [{
    methodologyVersionId: String,
    methodologyId: String,
    qualification: {
      type: String,
      enum: [
        'QUALIFIED_CALCULATION_INPUT',
        'SUPPORTING_EVIDENCE_ONLY',
        'NOT_QUALIFIED',
        'SUPPORTING_MONITORING_INPUT',
        'SUPPORTING_ENVIRONMENTAL_INPUT',
        'QUALIFIED_WATER_REGIME_INPUT',
        'QUALIFIED_SOIL_CARBON_INPUT'
      ]
    },
    notes: String,
    _id: false
  }],
  sensorSpecifications: {
    manufacturer: String,
    exactModel: String,
    measurementPrinciple: String,
    rangeMin: Number,
    rangeMax: Number,
    accuracyClass: String,
    resolution: Number,
    warmUpSeconds: Number,
    driftPerYear: String,
    calibrationMethod: String,
    calibrationIntervalMonths: Number,
    crossSensitivity: String
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });
schema.index({ model: 1, measurementCode: 1 });
module.exports = mongoose.model('MRVSensorCapability', schema, 'mrvSensorCapabilities');
