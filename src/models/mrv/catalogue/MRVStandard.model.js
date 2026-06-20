const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  standardId: { type: String, required: true, unique: true }, // 'VERRA-VCS'
  name: { type: String, required: true },
  owner: { type: String, required: true },
  programType: { type: String, enum: ['GHG_CREDITING', 'GHG_REMOVAL', 'CO_BENEFIT', 'ENVIRONMENTAL_COMMODITY'], required: true },
  description: { type: String },
  officialUrl: { type: String },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });
module.exports = mongoose.model('MRVStandard', schema, 'mrvStandards');
