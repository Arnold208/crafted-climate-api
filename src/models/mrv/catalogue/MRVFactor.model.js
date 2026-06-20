const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  factorId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  factorType: { type: String, required: true }, // 'GRID_EMISSION_FACTOR', 'FUEL_EMISSION_FACTOR', 'GWP'
  unit: { type: String, required: true },
  source: { type: String },
  country: { type: String },
  sector: { type: String },
  methodology: { type: String },
  description: { type: String },
  status: { type: String, enum: ['ACTIVE', 'DEPRECATED'], default: 'ACTIVE' },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });
module.exports = mongoose.model('MRVFactor', schema, 'mrvFactors');
