// model/batchCounterModel.js
const mongoose = require('mongoose');

const batchCounterSchema = new mongoose.Schema({
  year: { type: Number, required: true, unique: true },
  index: { type: Number, required: true, default: 1 },
});

module.exports = mongoose.model('BatchCounter', batchCounterSchema);
