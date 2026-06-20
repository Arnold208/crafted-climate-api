const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  runId: { type: String, required: true, unique: true },
  observationId: { type: String, required: true, index: true },
  checks: [{
    checkCode: { type: String, required: true },
    result: { type: String, enum: ['PASS', 'FAIL', 'WARNING', 'SKIPPED'], required: true },
    message: { type: String },
    value: { type: mongoose.Schema.Types.Mixed },
    threshold: { type: mongoose.Schema.Types.Mixed },
    _id: false
  }],
  overallResult: { type: String, enum: ['ACCEPTED', 'ACCEPTED_WITH_WARNING', 'QUARANTINED', 'REJECTED'], required: true },
  runAt: { type: Date, default: Date.now },
  runnerVersion: { type: String }
}, { versionKey: false });
module.exports = mongoose.model('MRVValidationRun', schema, 'mrvValidationRuns');
