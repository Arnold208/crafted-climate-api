const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  methodologyId: { type: String, required: true, unique: true }, // 'VERRA-VM0050'
  standardId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  shortCode: { type: String, required: true }, // 'VM0050'
  programType: { type: String },
  officialUrl: { type: String },
  scope: { type: String },
  activityTypes: [{ type: String }], // ['CLEAN_COOKING', 'FUEL_SWITCH']
  tier: { type: Number, default: 1 }, // 1, 2, 3
  status: { type: String, enum: ['ACTIVE', 'WITHDRAWN', 'ARCHIVED'], default: 'ACTIVE' },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });
module.exports = mongoose.model('MRVMethodology', schema, 'mrvMethodologies');
